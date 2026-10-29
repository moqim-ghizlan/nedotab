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
import { messagePage, RAPPEL_FORMAT, SYSTEME_TAGS } from "./prompts/tags.js";
import {
  messageRecherche,
  RAPPEL_FORMAT as RAPPEL_RECHERCHE,
  SYSTEME_RECHERCHE,
} from "./prompts/recherche.js";
import { lireSortieRecherche } from "./rechercheSortie.js";
import { construireListe, sitesDe } from "../partage/listeCompacte.js";
import { preFiltrer } from "../partage/preFiltre.js";
import { lireSortieTags } from "./tagsSortie.js";
import { extraitReduit } from "../partage/extraitPage.js";
import { jourParis } from "../quota.js";
import { ErreurPage } from "../reseau/recupererPage.js";


export const MESSAGE_TEST = "Réponds uniquement par OK";
export const JETONS_TEST = 256; // small, but room for a little reasoning before "OK"

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

/** Extract of a page (V4.3): same limits as extraitPage.js; a bad shape is refused. */
function verifierExtrait(v) {
  if (typeof v !== "object" || Array.isArray(v)) throw new EntreeInvalide("extrait invalide.");
  const texte = (x, max) => x == null || (typeof x === "string" && x.length <= max);
  const liste = (x, n, max) =>
    x == null || (Array.isArray(x) && x.length <= n && x.every((t) => texte(t, max) && t != null));
  if (
    !texte(v.titre, 300) ||
    !texte(v.description, 500) ||
    !texte(v.texte, 3000) ||
    !texte(v.langue, 10) ||
    !texte(v.domaine, 255) ||
    !liste(v.motsCles, 20, 100) ||
    !liste(v.titres, 20, 300)
  )
    throw new EntreeInvalide("extrait : tailles dépassées.");
}

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
  const lirePage = deps.lirePage ?? (async () => null); // (url) => extrait | null, V4.5
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

  /** One minimal call ("OK") with the imposed model, counted in the quota. */
  async function tester(uid, donnees) {
    const c = await config();
    const { fournisseur } = valider(donnees, {
      fournisseur: { type: "chaine", requis: true, valeurs: () => fournisseursActifs(c) },
    });
    const modele = c.modele;
    const a = adaptateur(fournisseur);
    const cles = await lireCles(uid);
    const entree = cles[fournisseur];
    if (!entree?.chiffre) throw new ErreurFournisseur("cle-absente");
    await consommer(uid, { n: 1, limite: await limiteDe(uid, c) });
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
   * The provider and the model of a use are imposed by config/ia (one model for everybody),
   * never read from the user's settings nor from the request. Only the switch is the user's.
   */
  async function choixDeLUsage(uid) {
    const snap = await db.doc(`users/${uid}`).get();
    if ((snap.exists ? snap.data()?.reglages?.ia : null)?.actif !== true)
      throw new ErreurFournisseur("ia-desactivee");
    const c = await config();
    const fournisseur = fournisseursActifs(c).find((id) => fournisseurs[id]);
    if (!fournisseur) throw new ErreurFournisseur("pas-de-modele");
    return { fournisseur, modele: c.modele };
  }

  /**
   * Common path of every AI feature (V4.4 and after): settings → quota → key in memory →
   * provider. `donnees`: { usage, systeme?, messages, maxJetons?, formatJson? } and nothing
   * else: a "fournisseur" or "modele" sent by the browser is refused.
   */
  async function executerUsage(uid, donnees) {
    const { usage, systeme, messages, maxJetons, formatJson, temperature } = valider(donnees, {
      usage: { type: "chaine", requis: true, valeurs: () => USAGES },
      systeme: { type: "chaine", max: 20000 },
      messages: { type: "libre", requis: true, verifier: verifierMessages },
      maxJetons: { type: "entier", min: 1, max: 8192 },
      formatJson: { type: "booleen" },
      temperature: {
        type: "libre",
        verifier: (v) => {
          if (typeof v !== "number" || !(v >= 0 && v <= 2))
            throw new EntreeInvalide("temperature : nombre entre 0 et 2 attendu.");
        },
      },
    });
    const { fournisseur, modele } = await choixDeLUsage(uid);
    const entree = (await lireCles(uid))[fournisseur];
    if (!entree?.chiffre) throw new ErreurFournisseur("cle-absente");
    const c = await config();
    await consommer(uid, { n: 1, limite: await limiteDe(uid, c) });
    const cle = dechiffrer(entree.chiffre, secret(), donneesAssociees(uid, fournisseur));
    const debut = horloge();
    try {
      const r = await fournisseurs[fournisseur].envoyer({
        cle,
        modele,
        systeme,
        messages,
        maxJetons,
        temperature,
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

  /**
   * V4.4: tags and description of a site from its page extract. One retry with a reminder of
   * the format when the answer is not valid, then "reponse-invalide".
   */
  async function genererTags(uid, donnees) {
    const { extrait, url, titre } = valider(donnees, {
      extrait: { type: "libre", verifier: verifierExtrait },
      url: { type: "chaine", requis: true, max: 2048, motif: /^https?:\/\/\S+$/i },
      titre: { type: "chaine", max: 300 },
    });
    // No extract (web app): the server reads the page itself, safely (recupererPage). A page
    // that cannot be read gives a reduced extract: the tags then come from title and domain.
    let page = extrait;
    if (!page) {
      // Page downloads per user and per day (config/ia.quotaPages): the function must not
      // become a crawler.
      await consommer(uid, {
        n: 1,
        limite: (await config()).quotaPages,
        document: "quotaPages",
      });
      try {
        page = await lirePage(url);
      } catch (e) {
        if (!(e instanceof ErreurPage)) throw e;
        journal({ action: "lirePage", code: e.code });
      }
      page ??= extraitReduit(url, titre);
    }
    const messages = [{ role: "user", texte: messagePage({ extrait: page, url, titre }) }];
    for (let essai = 0; essai < 2; essai++) {
      const r = await executerUsage(uid, {
        usage: "tags",
        systeme: SYSTEME_TAGS,
        messages:
          essai === 0
            ? messages
            : [...messages, { role: "assistant", texte: "..." }, { role: "user", texte: RAPPEL_FORMAT }],
        maxJetons: 1024,
        formatJson: true,
      });
      const sortie = lireSortieTags(r.texte);
      if (sortie) return { ...sortie, modele: r.modele };
    }
    throw new ErreurFournisseur("reponse-invalide");
  }

  /**
   * V4.9: smart search among the user's own sites. The browser sends only the question: the
   * server reads the grid itself, builds the compact list (pre-filtered when it is large),
   * and the model answers with short ids only, validated and turned back into real ids.
   * Same retry as the tags: one reminder of the format, then "reponse-invalide".
   */
  async function rechercher(uid, donnees) {
    const { question } = valider(donnees, {
      question: { type: "chaine", requis: true, min: 1, max: 500 },
    });
    if (!question.trim()) throw new EntreeInvalide("question : texte attendu.");
    const snap = await db.doc(`users/${uid}`).get();
    const sites = sitesDe(snap.exists ? snap.data()?.grille : []);
    // Nothing to search: no call, nothing paid.
    if (sites.length === 0) return { resultats: [], aucunResultat: true, preFiltre: false };
    const { sites: retenus, preFiltre } = preFiltrer(sites, question);
    const { lignes, table } = construireListe(retenus);
    const date = new Date(horloge()).toISOString().slice(0, 10);
    const messages = [{ role: "user", texte: messageRecherche({ date, question, lignes }) }];
    for (let essai = 0; essai < 2; essai++) {
      const r = await executerUsage(uid, {
        usage: "recherche",
        systeme: SYSTEME_RECHERCHE,
        messages:
          essai === 0
            ? messages
            : [
                ...messages,
                { role: "assistant", texte: "..." },
                { role: "user", texte: RAPPEL_RECHERCHE },
              ],
        maxJetons: 512,
        temperature: 0,
        formatJson: true,
      });
      const sortie = lireSortieRecherche(r.texte, table);
      if (sortie) return { ...sortie, modele: r.modele, preFiltre };
    }
    throw new ErreurFournisseur("reponse-invalide");
  }

  /**
   * The daily limit of a user (V4.7): the one they chose in the settings, never above the
   * ceiling of config/ia (quotaMax), else the default of config/ia.
   */
  async function limiteDe(uid, c) {
    const snap = await db.doc(`users/${uid}/prive/reglageQuota`).get();
    const choisie = snap.exists ? snap.data()?.limite : null;
    const plafond = Math.max(c.quotaMax, c.quotaQuotidien);
    return Number.isInteger(choisie) && choisie > 0 ? Math.min(choisie, plafond) : c.quotaQuotidien;
  }

  /** What is left of today's AI calls. Reads only: nothing is consumed (V4.6). */
  async function quotaRestant(uid, donnees) {
    valider(donnees, {});
    const c = await config();
    const limite = await limiteDe(uid, c);
    const snap = await db.doc(`users/${uid}/prive/quota`).get();
    const q = snap.exists ? snap.data() : null;
    const utilises = q?.jour === jourParis(new Date()) ? (q.appels ?? 0) : 0;
    return {
      limite,
      utilises,
      restant: Math.max(0, limite - utilises),
      defaut: c.quotaQuotidien,
      max: Math.max(c.quotaMax, c.quotaQuotidien),
    };
  }

  /** The user sets their own daily limit, between 1 and the ceiling of config/ia. */
  async function definirQuota(uid, donnees) {
    const c = await config();
    const plafond = Math.max(c.quotaMax, c.quotaQuotidien);
    const { limite } = valider(donnees, {
      limite: { type: "entier", requis: true, min: 1, max: plafond },
    });
    await db.doc(`users/${uid}/prive/reglageQuota`).set({ limite });
    return quotaRestant(uid, {});
  }

  return {
    quotaRestant,
    definirQuota,
    genererTags,
    rechercher,
    enregistrerCle,
    supprimerCle,
    etatCles,
    tester,
    executerUsage,
    choixDeLUsage,
  };
}
