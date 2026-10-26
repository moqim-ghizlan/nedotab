/**
 * The AI callable functions (V4.0), without Firebase around them so that they can be tested:
 * `deps` brings the database, the secret, the providers, the config, the quota and the log.
 * Common guard of every function: signed-in user (done by the caller), strict parameters,
 * quota before any paid call, keys decrypted only in memory for the time of a call.
 *
 * users/{uid}/prive/ia: { cles: { [fournisseur]: { chiffre, fin, ajouteLe, testeeLe, valide } } }
 * The browser can neither read nor write it (firestore.rules): only these functions.
 */
import { chiffrer, dechiffrer, donneesAssociees } from "../chiffrement.js";
import { EntreeInvalide, valider } from "../validation.js";
import { ErreurFournisseur } from "./fournisseurs/commun.js";
import { fournisseursActifs } from "./config.js";

export const MESSAGE_TEST = "Réponds uniquement par OK";
// Room for the reasoning of some models before the two letters of the answer.
export const JETONS_TEST = 1024;

const USAGES = ["tags", "recherche", "chat"];

function verifierMessages(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > 50)
    throw new EntreeInvalide("messages : 1 à 50 messages attendus.");
  for (const m of v) {
    if (!m || typeof m !== "object" || !["user", "assistant"].includes(m.role))
      throw new EntreeInvalide("messages : rôle invalide.");
    if (typeof m.texte !== "string" || m.texte.length < 1 || m.texte.length > 20000)
      throw new EntreeInvalide("messages : texte invalide.");
  }
}

const MODELE = { type: "chaine", requis: true, min: 1, max: 100, motif: /^[\w.:/-]+$/ };

/**
 * @param {{
 *   db: any, secret: () => string, fournisseurs: Record<string, any>,
 *   config: () => Promise<{ quotaQuotidien: number, fournisseurs: any[] }>,
 *   consommer: (uid: string, options: { n: number, limite: number }) => Promise<unknown>,
 *   journal?: (infos: object) => void, horloge?: () => number,
 * }} deps
 */
export function creerFonctionsIa(deps) {
  const { db, secret, fournisseurs, config, consommer, journal = () => {} } = deps;
  const horloge = deps.horloge ?? (() => Date.now());
  const refCles = (uid) => db.doc(`users/${uid}/prive/ia`);
  const lireCles = async (uid) => {
    const snap = await refCles(uid).get();
    return (snap.exists ? snap.data()?.cles : null) ?? {};
  };
  const adaptateur = (id) => {
    const a = fournisseurs[id];
    if (!a) throw new EntreeInvalide("Fournisseur non pris en charge.");
    return a;
  };

  /** Checks the key with the provider, then stores it encrypted (only if valid). */
  async function enregistrerCle(uid, donnees) {
    const c = await config();
    const { fournisseur, cle } = valider(donnees, {
      fournisseur: { type: "chaine", requis: true, valeurs: () => fournisseursActifs(c) },
      cle: { type: "chaine", requis: true, min: 20, max: 300, motif: /^\S+$/ },
    });
    const a = adaptateur(fournisseur);
    if (a.formatCle && !a.formatCle.test(cle)) {
      journal({ action: "formatCle", fournisseur, valide: false });
      throw new ErreurFournisseur("cle-invalide");
    }
    const debut = horloge();
    const verdict = await a.verifierCle({ cle });
    journal({
      action: "verifierCle",
      fournisseur,
      dureeMs: horloge() - debut,
      valide: verdict.valide,
    });
    if (!verdict.valide) throw new ErreurFournisseur(verdict.raison ?? "cle-invalide");
    const entree = {
      chiffre: chiffrer(cle, secret(), donneesAssociees(uid, fournisseur)),
      fin: cle.slice(-4),
      ajouteLe: horloge(),
      testeeLe: horloge(),
      valide: true,
    };
    const cles = await lireCles(uid);
    await refCles(uid).set({ cles: { ...cles, [fournisseur]: entree } });
    return { fournisseur, fin: entree.fin, valide: true };
  }

  async function supprimerCle(uid, donnees) {
    const { fournisseur } = valider(donnees, {
      fournisseur: { type: "chaine", requis: true, valeurs: () => Object.keys(fournisseurs) },
    });
    const cles = await lireCles(uid);
    delete cles[fournisseur];
    await refCles(uid).set({ cles });
    return { ok: true };
  }

  /** What the user may see of their keys: never the key, nor its encrypted form. */
  async function etatCles(uid, donnees) {
    valider(donnees, {});
    const cles = await lireCles(uid);
    return Object.entries(cles).map(([fournisseur, e]) => ({
      fournisseur,
      fin: e.fin ?? null,
      ajouteLe: e.ajouteLe ?? null,
      valide: e.valide ?? null,
    }));
  }

  /** One minimal call ("OK"), counted in the quota. */
  async function tester(uid, donnees) {
    const c = await config();
    const { fournisseur, modele } = valider(donnees, {
      fournisseur: { type: "chaine", requis: true, valeurs: () => fournisseursActifs(c) },
      modele: MODELE,
    });
    const a = adaptateur(fournisseur);
    const cles = await lireCles(uid);
    const entree = cles[fournisseur];
    if (!entree?.chiffre) throw new ErreurFournisseur("cle-absente");
    await consommer(uid, { n: 1, limite: c.quotaQuotidien });
    const cle = dechiffrer(entree.chiffre, secret(), donneesAssociees(uid, fournisseur));
    const debut = horloge();
    try {
      const r = await a.envoyer({
        cle,
        modele,
        messages: [{ role: "user", texte: MESSAGE_TEST }],
        maxJetons: JETONS_TEST,
      });
      const latenceMs = horloge() - debut;
      journal({
        action: "tester",
        fournisseur,
        modele,
        dureeMs: latenceMs,
        jetons: r.jetonsEntree + r.jetonsSortie,
      });
      await refCles(uid).set({
        cles: { ...cles, [fournisseur]: { ...entree, testeeLe: horloge(), valide: true } },
      });
      return { ok: /\bok\b/i.test(r.texte), latenceMs, modele: r.modele };
    } catch (e) {
      const code = e?.code ?? "fournisseur-indisponible";
      journal({ action: "tester", fournisseur, modele, dureeMs: horloge() - debut, code });
      if (code === "cle-invalide" || code === "cle-sans-credit") {
        await refCles(uid).set({
          cles: { ...cles, [fournisseur]: { ...entree, testeeLe: horloge(), valide: false } },
        });
      }
      throw e;
    }
  }

  /**
   * The provider and the model of a use (tags, search, chat) are read HERE, from the user's
   * settings (users/{uid}.reglages.ia), never from the request: the browser cannot ask for a
   * provider it has no key for, and the screen and the server cannot disagree.
   */
  async function choixDeLUsage(uid, usage) {
    const snap = await db.doc(`users/${uid}`).get();
    const ia = snap.exists ? snap.data()?.reglages?.ia : null;
    if (ia?.actif !== true) throw new ErreurFournisseur("ia-desactivee");
    const choix = ia.usages?.[usage];
    if (!choix?.fournisseur || !choix?.modele) throw new ErreurFournisseur("pas-de-modele");
    const c = await config();
    if (!fournisseursActifs(c).includes(choix.fournisseur) || !fournisseurs[choix.fournisseur])
      throw new ErreurFournisseur("pas-de-modele");
    return { fournisseur: choix.fournisseur, modele: choix.modele };
  }

  /**
   * Common path of every AI feature (V4.4 and after): settings → quota → key in memory →
   * provider. `donnees`: { usage, systeme?, messages, maxJetons?, formatJson? } and nothing
   * else: a "fournisseur" or "modele" sent by the browser is refused.
   */
  async function executerUsage(uid, donnees) {
    const { usage, systeme, messages, maxJetons, formatJson } = valider(donnees, {
      usage: { type: "chaine", requis: true, valeurs: () => USAGES },
      systeme: { type: "chaine", max: 20000 },
      messages: { type: "libre", requis: true, verifier: verifierMessages },
      maxJetons: { type: "entier", min: 1, max: 8192 },
      formatJson: { type: "booleen" },
    });
    const { fournisseur, modele } = await choixDeLUsage(uid, usage);
    const entree = (await lireCles(uid))[fournisseur];
    if (!entree?.chiffre) throw new ErreurFournisseur("cle-absente");
    const c = await config();
    await consommer(uid, { n: 1, limite: c.quotaQuotidien });
    const cle = dechiffrer(entree.chiffre, secret(), donneesAssociees(uid, fournisseur));
    const debut = horloge();
    try {
      const r = await fournisseurs[fournisseur].envoyer({
        cle,
        modele,
        systeme,
        messages,
        maxJetons,
        formatJson,
      });
      journal({
        action: usage,
        fournisseur,
        modele,
        dureeMs: horloge() - debut,
        jetons: r.jetonsEntree + r.jetonsSortie,
      });
      return { texte: r.texte, modele: r.modele };
    } catch (e) {
      journal({ action: usage, fournisseur, modele, dureeMs: horloge() - debut, code: e?.code });
      throw e;
    }
  }

  return { enregistrerCle, supprimerCle, etatCles, tester, executerUsage, choixDeLUsage };
}
