/**
 * V4.28: public share links. The server never sees a key, a password or a clear content: it
 * stores an encrypted copy that only the holder of the link ("#token.key", the fragment never
 * reaches the server) can read. This is the only public door of the application: validation is
 * strict, answers are uniform, limits and an emergency switch protect the costs.
 *
 * Everything external is injected (database, storage, clock, randomness, hash of the address)
 * so the logic is tested without Firebase. Logs carry VOLUMES only (see index.js): never a token,
 * a key, a password, a content or an address.
 *
 * Data (readable by the functions only, every client rule says no):
 *   liensPartage/{token}                 { uid, idLien, creeLe, expireLe, ouverturesMax, ouvertures,
 *                                          motDePasse, preuveHash?, iterations?, essais, revoque,
 *                                          suspendu, type, tailleChiffree, cheminCopie?, tickets,
 *                                          supprimerApres?, derniereOuvertureLe? }
 *   liensPartage/{token}/contenu/copie   { donnees }  (text and links, base64url, encrypted)
 *   Storage liens/{token}/copie          encrypted file (iv || ciphertext)
 *   signalements/{token}__{addressHash}  one report per distinct address
 *   limitesPartage/{addressHash}         { n, fenetre } rate limit, short-lived
 *   config/partage                       { liensActifs, ouvertA: "liste"|"tous", createurs: [uid] }
 */
import { Buffer } from "node:buffer";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DUREES } from "../../partage/expirationPartage.js";
import {
  CREATIONS_PAR_HEURE,
  ESSAIS_MAX,
  LIENS_ACTIFS_MAX,
  RECU_MS,
  decisionOuverture,
  jetonValide,
  validerCreation,
} from "../../partage/lienPartage.js";

export const REQUETES_PAR_MINUTE = 30;
export const SIGNALEMENTS_POUR_SUSPENDRE = 3;
export const DELAI_MIN_ECHEC_MS = 250;
export const CACHE_CONFIG_MS = 30_000;
const B64U = /^[A-Za-z0-9_-]+$/;

export class ErreurLien extends Error {
  /** @param {"indisponible"|"verrouille"|"mot-de-passe"|"limite"|"desactive"|"interdit"|"invalide"|"plein"} code */
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const sha256 = (texte) => createHash("sha256").update(texte).digest();
const egal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const octetsDe = (b64u) => Math.floor((b64u.length * 6) / 8);
const decoder = (b64u) => Buffer.from(b64u, "base64url");

/**
 * @param {object} d
 * @param {any} d.db Firestore (Admin SDK shape)
 * @param {{ ecrire(chemin: string, octets: Buffer): Promise<void>, lire(chemin: string): Promise<Buffer>, supprimer(chemin: string): Promise<void> }} d.stockage
 * @param {() => number} [d.maintenant]
 * @param {(n: number) => string} [d.aleatoire] random base64url of n bytes
 * @param {(adresse: string, maintenant: number) => string} [d.empreinteAdresse] salted, rotating hash of the address
 * @param {(ms: number) => Promise<void>} [d.attendre]
 * @param {(ms: number) => unknown} [d.horodatage] Firestore Timestamp (needed by the TTL of limitesPartage)
 */
export function creerLiens({
  db,
  stockage,
  maintenant = Date.now,
  aleatoire = (n) => randomBytes(n).toString("base64url"),
  empreinteAdresse = (a, t) => sha256(`${a}:${Math.floor(t / 600_000)}`).toString("base64url"),
  attendre = (ms) => new Promise((ok) => setTimeout(ok, ms)),
  horodatage = (ms) => ms,
}) {
  const lien = (jeton) => db.doc(`liensPartage/${jeton}`);
  const copie = (jeton) => db.doc(`liensPartage/${jeton}/contenu/copie`);
  const chemin = (jeton) => `liens/${jeton}/copie`;

  // --- Emergency switch, with a 30 s cache ----------------------------------------------------
  let cache = { jusqua: 0, valeur: null };
  async function config() {
    const t = maintenant();
    if (cache.valeur && t < cache.jusqua) return cache.valeur;
    const d = (await db.doc("config/partage").get()).data() ?? {};
    cache = {
      jusqua: t + CACHE_CONFIG_MS,
      valeur: {
        liensActifs: d.liensActifs === true,
        ouvertA: d.ouvertA === "tous" ? "tous" : "liste",
        createurs: Array.isArray(d.createurs) ? d.createurs : [],
      },
    };
    return cache.valeur;
  }

  async function supprimerLien(jeton, donnees) {
    if (donnees?.cheminCopie) await stockage.supprimer(donnees.cheminCopie).catch(() => {});
    await copie(jeton)
      .delete()
      .catch(() => {});
    await lien(jeton).delete();
  }

  // --- Creation (signed-in owner) -----------------------------------------------------------------
  async function creer(uid, p) {
    const c = await config();
    if (!c.liensActifs)
      throw new ErreurLien("desactive", "Les liens sont temporairement désactivés.");
    if (c.ouvertA !== "tous" && !c.createurs.includes(uid))
      throw new ErreurLien("interdit", "La création de liens n'est pas ouverte à ce compte.");
    if ((await db.doc(`users/${uid}/prive/partage`).get()).data()?.suspendu === true)
      throw new ErreurLien("interdit", "La création de liens est suspendue pour ce compte.");

    if (!jetonValide(p?.jeton)) throw new ErreurLien("invalide", "Lien invalide.");
    if (typeof p.donnees !== "string" || !B64U.test(p.donnees))
      throw new ErreurLien("invalide", "Contenu invalide.");
    const tailleChiffree = octetsDe(p.donnees);
    const motDePasse = p.motDePasse === true;
    const erreur = validerCreation({
      type: p.type,
      dureeId: p.dureeId,
      ouverturesMax: p.ouverturesMax,
      tailleChiffree,
      motDePasse,
    });
    if (erreur) throw new ErreurLien("invalide", erreur);
    if (motDePasse) {
      if (typeof p.preuve !== "string" || !B64U.test(p.preuve) || p.preuve.length !== 43)
        throw new ErreurLien("invalide", "Mot de passe invalide.");
      if (!Number.isInteger(p.iterations) || p.iterations < 310_000 || p.iterations > 2_000_000)
        throw new ErreurLien("invalide", "Paramètres invalides.");
    }

    const t = maintenant();
    const miens = (await db.collection("liensPartage").where("uid", "==", uid).get()).docs.map(
      (x) => x.data(),
    );
    if (miens.filter((l) => !l.revoque && l.expireLe > t).length >= LIENS_ACTIFS_MAX)
      throw new ErreurLien(
        "plein",
        `${LIENS_ACTIFS_MAX} liens actifs au maximum : révoquez-en un.`,
      );
    if (miens.filter((l) => l.creeLe > t - 3_600_000).length >= CREATIONS_PAR_HEURE)
      throw new ErreurLien("limite", "Trop de liens créés en une heure : réessayez plus tard.");

    const idLien = aleatoire(9);
    const fichier = p.type === "fichier";
    const doc = {
      uid,
      idLien,
      creeLe: t,
      expireLe: t + DUREES.find((x) => x.id === p.dureeId).ms,
      ouverturesMax: p.ouverturesMax,
      ouvertures: 0,
      motDePasse,
      ...(motDePasse
        ? { preuveHash: sha256(p.preuve).toString("base64url"), iterations: p.iterations }
        : {}),
      essais: 0,
      revoque: false,
      suspendu: false,
      type: p.type,
      tailleChiffree,
      tickets: {},
      ...(fichier ? { cheminCopie: chemin(p.jeton) } : {}),
    };
    // The token is chosen by the device: refuse a token that already exists (no overwriting).
    await db.runTransaction(async (tx) => {
      if ((await tx.get(lien(p.jeton))).exists) throw new ErreurLien("invalide", "Lien invalide.");
      tx.set(lien(p.jeton), doc);
      if (!fichier) tx.set(copie(p.jeton), { donnees: p.donnees });
    });
    if (fichier) {
      try {
        await stockage.ecrire(chemin(p.jeton), decoder(p.donnees));
      } catch (e) {
        await lien(p.jeton)
          .delete()
          .catch(() => {});
        throw e;
      }
    }
    return { idLien, expireLe: doc.expireLe };
  }

  // --- Opening (anyone with the link, no account) ---------------------------------------------
  async function limiter(adresse) {
    const t = maintenant();
    const h = empreinteAdresse(adresse, t);
    const r = db.doc(`limitesPartage/${h}`);
    const trop = await db.runTransaction(async (tx) => {
      const d = (await tx.get(r)).data();
      const fenetre = Math.floor(t / 60_000);
      const n = d && d.fenetre === fenetre ? d.n + 1 : 1;
      // expireLe: a TTL removes these small documents (kept 10 minutes).
      tx.set(r, { n, fenetre, expireLe: horodatage(t + 600_000) });
      return n > REQUETES_PAR_MINUTE;
    });
    if (trop) throw new ErreurLien("limite", "Trop de requêtes : réessayez dans une minute.");
  }

  async function ouvrirSansDelai({ jeton, action, preuve, ticket }, adresse) {
    if (!(await config()).liensActifs) throw new ErreurLien("indisponible", "indisponible");
    await limiter(adresse);
    if (!jetonValide(jeton)) throw new ErreurLien("indisponible", "indisponible");
    const t = maintenant();

    if (action === "info") {
      const l = (await lien(jeton).get()).data();
      if (!l || decisionOuverture(l, t) === "indisponible")
        throw new ErreurLien("indisponible", "indisponible");
      return {
        type: l.type,
        taille: l.tailleChiffree,
        motDePasse: l.motDePasse,
        iterations: l.iterations ?? null,
        verrouille: decisionOuverture(l, t) === "verrouille",
      };
    }
    if (action !== "ouvrir") throw new ErreurLien("indisponible", "indisponible");

    const hashTicket =
      typeof ticket === "string" && B64U.test(ticket) ? sha256(ticket).toString("base64url") : null;
    const r = await db.runTransaction(async (tx) => {
      const l = (await tx.get(lien(jeton))).data();
      if (!l || l.revoque || l.suspendu) throw new ErreurLien("indisponible", "indisponible");
      // A valid receipt (2 minutes) gives the content again WITHOUT counting a new opening.
      if (hashTicket && (l.tickets?.[hashTicket] ?? 0) > t) return { l, ticket: ticket };
      const decision = decisionOuverture(l, t);
      if (decision === "indisponible") throw new ErreurLien("indisponible", "indisponible");
      if (decision === "verrouille") throw new ErreurLien("verrouille", "verrouille");
      if (l.motDePasse) {
        const attendu = Buffer.from(l.preuveHash, "base64url");
        const recu =
          typeof preuve === "string" && B64U.test(preuve) ? sha256(preuve) : Buffer.alloc(0);
        if (!egal(attendu, recu)) {
          const essais = (l.essais ?? 0) + 1;
          tx.update(lien(jeton), { essais });
          // The failure is recorded even though the request is refused: no throw inside the transaction.
          return { echec: { restants: Math.max(0, ESSAIS_MAX - essais) } };
        }
      }
      const nouveau = aleatoire(24);
      const ouvertures = l.ouvertures + 1;
      const tickets = Object.fromEntries(
        Object.entries(l.tickets ?? {}).filter(([, fin]) => fin > t),
      );
      tickets[sha256(nouveau).toString("base64url")] = t + RECU_MS;
      const maj = { ouvertures, tickets, derniereOuvertureLe: t, essais: 0 };
      // Last opening: the content disappears once the receipt has run out.
      if (l.ouverturesMax > 0 && ouvertures >= l.ouverturesMax) maj.supprimerApres = t + RECU_MS;
      tx.update(lien(jeton), maj);
      return { l, ticket: nouveau };
    });
    if (r.echec) throw new ErreurLien("mot-de-passe", "Mot de passe incorrect.", r.echec);
    const donnees =
      r.l.type === "fichier"
        ? (await stockage.lire(r.l.cheminCopie)).toString("base64url")
        : (await copie(jeton).get()).data()?.donnees;
    if (typeof donnees !== "string") throw new ErreurLien("indisponible", "indisponible");
    return { ticket: r.ticket, type: r.l.type, donnees, iterations: r.l.iterations ?? null };
  }

  /** Same duration for every failure: no information in the response time. */
  async function ouvrir(p, adresse) {
    const debut = maintenant();
    try {
      return await ouvrirSansDelai(p ?? {}, adresse ?? "");
    } catch (e) {
      const reste = DELAI_MIN_ECHEC_MS - (maintenant() - debut);
      if (reste > 0) await attendre(reste);
      throw e;
    }
  }

  // --- Owner: list, revoke ----------------------------------------------------------------------
  async function lister(uid) {
    const t = maintenant();
    return (await db.collection("liensPartage").where("uid", "==", uid).get()).docs
      .map((x) => x.data())
      .filter((l) => !l.revoque && l.expireLe > t)
      .map((l) => ({
        idLien: l.idLien,
        type: l.type,
        creeLe: l.creeLe,
        expireLe: l.expireLe,
        ouverturesMax: l.ouverturesMax,
        ouvertures: l.ouvertures,
        motDePasse: l.motDePasse,
        verrouille: (l.essais ?? 0) >= ESSAIS_MAX,
        suspendu: l.suspendu === true,
        derniereOuvertureLe: l.derniereOuvertureLe ?? null,
      }))
      .sort((a, b) => b.creeLe - a.creeLe);
  }

  async function revoquer(uid, idLien) {
    if (typeof idLien !== "string" || !B64U.test(idLien))
      throw new ErreurLien("invalide", "Lien inconnu.");
    const s = await db.collection("liensPartage").where("uid", "==", uid).get();
    const trouve = s.docs.find((x) => x.data().idLien === idLien);
    if (!trouve) throw new ErreurLien("invalide", "Lien inconnu.");
    await supprimerLien(trouve.id, trouve.data());
    return { ok: true };
  }

  // --- Report -----------------------------------------------------------------------------------
  async function signaler({ jeton, motif }, adresse) {
    if (!(await config()).liensActifs || !jetonValide(jeton)) return { ok: true };
    await limiter(adresse ?? "");
    const l = (await lien(jeton).get()).data();
    if (!l) return { ok: true }; // same answer whether the link exists or not
    const h = empreinteAdresse(adresse ?? "", 0); // stable per address: one report per person
    await db
      .doc(`signalements/${jeton}__${h}`)
      .set({
        jeton,
        creeLe: maintenant(),
        motif: typeof motif === "string" ? motif.slice(0, 200) : "",
      });
    const n = (await db.collection("signalements").where("jeton", "==", jeton).get()).size;
    if (n >= SIGNALEMENTS_POUR_SUSPENDRE && !l.suspendu) {
      await lien(jeton).update({ suspendu: true });
      await db.doc(`users/${l.uid}/prive/partage`).set({ aExaminer: true }, { merge: true });
    }
    return { ok: true };
  }

  // --- Cleanup (called by the scheduled function of V4.27) ----------------------------------------
  /** Removes expired links and exhausted ones whose receipt has run out. */
  async function nettoyerLiens() {
    const t = maintenant();
    let nb = 0;
    for (const champ of ["expireLe", "supprimerApres"]) {
      const s = await db.collection("liensPartage").where(champ, "<=", t).limit(200).get();
      for (const x of s.docs) {
        await supprimerLien(x.id, x.data());
        nb++;
      }
    }
    return { liens: nb };
  }

  /** All the links of an account (account deletion). */
  async function supprimerLiensDe(uid) {
    const s = await db.collection("liensPartage").where("uid", "==", uid).get();
    for (const x of s.docs) await supprimerLien(x.id, x.data());
    return { liens: s.size };
  }

  return { creer, ouvrir, lister, revoquer, signaler, nettoyerLiens, supprimerLiensDe };
}
