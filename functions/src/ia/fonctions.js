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
import {
  messageRangement,
  RAPPEL_FORMAT as RAPPEL_RANGEMENT,
  SYSTEME_RANGEMENT,
} from "./prompts/rangement.js";
import { lireSortieRangement } from "./rangementSortie.js";
import { diffuser } from "./chatFlux.js";
import { SYSTEME_CHAT, systemeChatAvecSites } from "./prompts/chat.js";
import { champsAutorises, permis, validerConfidentialite } from "../partage/confidentialiteIa.js";
import { creerEffacements, EFFACEMENTS } from "./effacements.js";
import { creerCache, cleCache, DUREE_RECHERCHE_MS, DUREE_TAGS_MS } from "../cacheIa.js";
import { creerUsage } from "../usage.js";
import { PROMPT_RECHERCHE_VERSION } from "./prompts/recherche.js";
import { PROMPT_TAGS_VERSION } from "./prompts/tags.js";
import { creerConversations, MOTIF_ID_CONVERSATION, referencesReelles } from "./conversations.js";
import { besoinContexteSites, validerModeSitesChat } from "../partage/besoinContexteSites.js";
import {
  construireListe,
  construireListeDossiers,
  dossiersDe,
  sitesDe,
} from "../partage/listeCompacte.js";
import {
  extraireBlocActions,
  TEXTE_PROPOSITION_PAR_DEFAUT,
  validerActions,
} from "../partage/outils.js";
import { preFiltrer } from "../partage/preFiltre.js";
import { CHAMP_USAGE } from "../partage/listeCompacte.js";
import { niveauUsage, normaliserStats, scoreActuel } from "../partage/usage.js";
import { lireSortieTags } from "./tagsSortie.js";
import { extraitReduit } from "../partage/extraitPage.js";
import { jourParis } from "../quota.js";
import { ErreurPage } from "../reseau/recupererPage.js";

export const MESSAGE_TEST = "Réponds uniquement par OK";
export const JETONS_TEST = 256; // small, but room for a little reasoning before "OK"

const USAGES = ["tags", "recherche", "chat", "rangement"];

/** One message of a call: the list of the sites of the smart search can be long (V4.9). */
export const MESSAGE_TEXTE_MAX = 150000;
const LISTE_MAX = 120000;

function verifierMessages(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > 50)
    throw new EntreeInvalide("messages : 1 à 50 messages attendus.");
  for (const m of v) {
    if (!m || typeof m !== "object" || !["user", "assistant"].includes(m.role))
      throw new EntreeInvalide("messages : rôle invalide.");
    if (typeof m.texte !== "string" || m.texte.length < 1 || m.texte.length > MESSAGE_TEXTE_MAX)
      throw new EntreeInvalide("messages : texte invalide.");
  }
}

export const CHAT_MESSAGES_MAX = 40;
export const CHAT_MESSAGE_MAX = 4000;
export const CHAT_TOTAL_MAX = 30000;

/** Conversation of the chat (V4.11): 1 to 40 messages, the last one from the user. */
function verifierMessagesChat(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > CHAT_MESSAGES_MAX)
    throw new EntreeInvalide(`messages : 1 à ${CHAT_MESSAGES_MAX} messages attendus.`);
  let total = 0;
  for (const m of v) {
    if (!m || typeof m !== "object" || !["user", "assistant"].includes(m.role))
      throw new EntreeInvalide("messages : rôle invalide.");
    if (typeof m.texte !== "string" || !m.texte.trim() || m.texte.length > CHAT_MESSAGE_MAX)
      throw new EntreeInvalide(`messages : texte de 1 à ${CHAT_MESSAGE_MAX} caractères attendu.`);
    total += m.texte.length;
  }
  if (total > CHAT_TOTAL_MAX) throw new EntreeInvalide("messages : conversation trop longue.");
  if (v.at(-1).role !== "user")
    throw new EntreeInvalide("messages : le dernier message doit être de l'utilisateur.");
}

const REFERENCE_SITE = /\[\[site:(s\d+)\]\]/g;

/**
 * V4.14: the sites the answer cites, as { "s12": real id }, only the ones that exist in the
 * table of this request (an invented id is left out: the browser shows "site introuvable").
 */
export function referencesCitees(texte, table) {
  const citees = {};
  for (const [, court] of String(texte ?? "").matchAll(REFERENCE_SITE)) {
    if (Object.hasOwn(table, court)) citees[court] = table[court];
  }
  return citees;
}

/** The history sent back by the browser holds no reference of a past answer: ids change. */
const sansReferences = (messages) =>
  messages.map((m) =>
    m.role === "assistant"
      ? { ...m, texte: m.texte.replace(/\[\[site:[^\]]*\]\]/g, "(site de la collection)") }
      : m,
  );

/**
 * V4.16: the answer without its ```actions block, and the proposal the block holds once
 * validated against the tables of THIS request (null when there is nothing valid, or no
 * collection was joined: a short id could not mean anything).
 */
function separerProposition(texteBrut, contexte) {
  const { texte, brut } = extraireBlocActions(texteBrut);
  if (!contexte || !brut) return { texte, proposition: null };
  const { actions } = validerActions(brut, {
    sites: contexte.table,
    dossiers: contexte.tableDossiers,
  });
  if (!actions.length) return { texte, proposition: null };
  const id = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return { texte: texte.trim() ? texte : TEXTE_PROPOSITION_PAR_DEFAUT, proposition: { id, actions } };
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
  // V4.19: usage statistics and personal limits (when an `increment` is given), answer cache.
  const usageSvc = deps.increment
    ? creerUsage({ db, config, increment: deps.increment, horloge })
    : null;
  const cache = creerCache({ db, horloge });
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
   * Before any paid call: AI on, key present, quota consumed (1), key decrypted in memory.
   */
  async function preparerAppel(uid) {
    const { fournisseur, modele } = await choixDeLUsage(uid);
    const entree = (await lireCles(uid))[fournisseur];
    if (!entree?.chiffre) throw new ErreurFournisseur("cle-absente");
    const c = await config();
    // V4.19: the user's own limit, apart from the quota of the service.
    if (await usageSvc?.verifierLimite(uid)) throw new ErreurFournisseur("limite-personnelle");
    await consommer(uid, { n: 1, limite: await limiteDe(uid, c) });
    const cle = dechiffrer(entree.chiffre, secret(), donneesAssociees(uid, fournisseur));
    return { fournisseur, modele, cle };
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
    const { fournisseur, modele, cle } = await preparerAppel(uid);
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
      await usageSvc?.enregistrer(uid, {
        usage,
        fournisseur,
        modele,
        jetonsEntree: r.jetonsEntree,
        jetonsSortie: r.jetonsSortie,
      });
      return {
        texte: r.texte,
        modele: r.modele,
        jetonsEntree: r.jetonsEntree,
        jetonsSortie: r.jetonsSortie,
      };
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
    // V4.20: the user's choices about page content, applied here whatever the browser sent.
    const conf = await confidentialiteDe(uid);
    const lirePagesPermis = permis(conf, "lirePages");
    if (lirePagesPermis && !extrait && !permis(conf, "lectureServeur"))
      throw new ErreurFournisseur("lecture-serveur-desactivee");
    const extraitUtile = lirePagesPermis ? extrait : undefined;
    // V4.19: the same page, extract, model and prompt give the same tags: no new paid call.
    const modeleTags = (await config()).modele;
    const cleTags = cleCache([
      "tags",
      PROMPT_TAGS_VERSION,
      modeleTags,
      url,
      titre ?? null,
      extraitUtile ?? null,
      lirePagesPermis,
    ]);
    await choixDeLUsage(uid); // AI switched off: not even the cache answers
    const connu = await cache.lire(uid, cleTags);
    if (connu) {
      await usageSvc?.evite(uid);
      return connu;
    }
    // No extract (web app): the server reads the page itself, safely (recupererPage). A page
    // that cannot be read gives a reduced extract: the tags then come from title and domain.
    let page = extraitUtile;
    if (!lirePagesPermis) page = extraitReduit(url, titre); // title and address only
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
            : [
                ...messages,
                { role: "assistant", texte: "..." },
                { role: "user", texte: RAPPEL_FORMAT },
              ],
        maxJetons: 1024,
        formatJson: true,
      });
      const sortie = lireSortieTags(r.texte);
      if (sortie) {
        const reponse = { ...sortie, modele: r.modele };
        await cache.ecrire(uid, cleTags, reponse, DUREE_TAGS_MS);
        return reponse;
      }
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
    const conf = validerConfidentialite(snap.exists ? snap.data()?.reglages?.ia?.confidentialite : null);
    if (!permis(conf, "titresAdresses")) throw new ErreurFournisseur("confidentialite-sites");
    const sites = sitesDe(snap.exists ? snap.data()?.grille : []);
    // Nothing to search: no call, nothing paid.
    if (sites.length === 0)
      return { intention: "question", resultats: [], aucunResultat: true, preFiltre: false };
    const { sites: retenus, preFiltre } = preFiltrer(sites, question);
    const autorises = champsAutorises(conf);
    // V4.21: usage level of each site, unless the user switched tracking or sharing off.
    const reglages = snap.exists ? snap.data()?.reglages : null;
    if (reglages?.sansSuiviUsage !== true && reglages?.sansUsagePourIa !== true) {
      const stats = normaliserStats((await db.doc(`users/${uid}/stats/visites`).get()).data());
      const maintenant = horloge();
      for (const s of retenus) s.usage = niveauUsage(scoreActuel(stats.poids[s.id], maintenant));
      autorises.push(CHAMP_USAGE);
    }
    let { lignes, table } = construireListe(retenus, { champs: autorises });
    // A very long list (long descriptions): the descriptions are left out rather than refused.
    if (lignes.join("\n").length > LISTE_MAX) {
      ({ lignes, table } = construireListe(retenus, {
        champs: autorises.filter((c) => c !== "description"),
      }));
    }
    // V4.19: same question, same grid, model and prompt: answered from the cache (24 h).
    const cleRecherche = cleCache([
      "recherche",
      PROMPT_RECHERCHE_VERSION,
      (await config()).modele,
      question.toLowerCase().replace(/\s+/g, " ").trim(),
      cleCache(lignes),
    ]);
    await choixDeLUsage(uid);
    const connuRecherche = await cache.lire(uid, cleRecherche);
    if (connuRecherche) {
      await usageSvc?.evite(uid);
      return connuRecherche;
    }
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
        maxJetons: 768,
        temperature: 0,
        formatJson: true,
      });
      const sortie = lireSortieRecherche(r.texte, table);
      if (sortie) {
        const reponse = { ...sortie, modele: r.modele, preFiltre };
        await cache.ecrire(uid, cleRecherche, reponse, DUREE_RECHERCHE_MS);
        return reponse;
      }
    }
    throw new ErreurFournisseur("reponse-invalide");
  }

  /** V4.20: what the user lets the AI see (reglages.ia.confidentialite), read on the server. */
  async function confidentialiteDe(uid) {
    const snap = await db.doc(`users/${uid}`).get();
    return validerConfidentialite(snap.exists ? snap.data()?.reglages?.ia?.confidentialite : null);
  }

  /**
   * V4.14: the collection of the user for the chat, or null when it is not needed (setting
   * "jamais", empty grid, or "auto" and the conversation does not concern the sites). Same
   * pre-filter as the smart search, based on the last message.
   */
  async function contexteSites(uid, messages) {
    const snap = await db.doc(`users/${uid}`).get();
    const donnees = snap.exists ? snap.data() : null;
    const mode = validerModeSitesChat(donnees?.reglages?.ia?.sitesChat);
    if (mode === "jamais") return null;
    // V4.20: no title and address, no list: the chat answers without knowing the collection.
    const conf = validerConfidentialite(donnees?.reglages?.ia?.confidentialite);
    if (!permis(conf, "titresAdresses")) return null;
    const sites = sitesDe(donnees?.grille);
    if (!besoinContexteSites({ mode, sites, messages })) return null;
    const { lignes: lignesDossiers, table: tableDossiers } = construireListeDossiers(
      dossiersDe(donnees?.grille),
    );
    const question = messages.findLast((m) => m.role === "user").texte;
    const { sites: retenus } = preFiltrer(sites, question);
    const autorises = champsAutorises(conf);
    let { lignes, table } = construireListe(retenus, { champs: autorises });
    if (lignes.join("\n").length > LISTE_MAX) {
      ({ lignes, table } = construireListe(retenus, {
        champs: autorises.filter((c) => c !== "description"),
      }));
    }
    // Folder names are folder paths too: left out when the user does not share them.
    const dossiersEnvoyes = permis(conf, "chemins") ? lignesDossiers : [];
    return { lignes, table, lignesDossiers: dossiersEnvoyes, tableDossiers: permis(conf, "chemins") ? tableDossiers : {} };
  }

  /**
   * V4.11: one answer of the chat (not streamed yet). The browser sends the history of the
   * current conversation; each message sent counts for 1 in the quota. Nothing is kept on the
   * server.
   */
  async function chat(uid, donnees, { enregistrer } = {}) {
    const { messages } = valider(donnees, {
      messages: { type: "libre", requis: true, verifier: verifierMessagesChat },
    });
    const contexte = await contexteSites(uid, messages);
    const r = await executerUsage(uid, {
      usage: "chat",
      systeme: contexte
        ? systemeChatAvecSites(contexte.lignes, contexte.lignesDossiers)
        : SYSTEME_CHAT,
      messages: sansReferences(messages),
      maxJetons: 1000,
      temperature: 0.5,
    });
    const { texte: reponse, proposition } = separerProposition(r.texte, contexte);
    const sites = contexte ? referencesCitees(reponse, contexte.table) : {};
    const messageId = await enregistrer?.({
      texte: referencesReelles(reponse, contexte?.table),
      etat: "ok",
      proposition,
      modele: r.modele,
      jetons: { entree: r.jetonsEntree ?? 0, sortie: r.jetonsSortie ?? 0 },
      sitesCites: Object.values(sites),
    });
    return {
      texte: reponse,
      modele: r.modele,
      jetonsEntree: r.jetonsEntree,
      jetonsSortie: r.jetonsSortie,
      ...(contexte ? { consulte: true, sites } : {}),
      ...(proposition ? { proposition } : {}),
      ...(messageId ? { messageId } : {}),
    };
  }

  /**
   * V4.12: the same answer as `chat`, sent to the browser as it is generated. Same checks and
   * same quota (consumed at the start). `envoyerMorceau` writes a chunk to the browser,
   * `signal` is aborted when it leaves or presses "Arrêter": the request to the provider is then
   * cancelled. An error before the first byte is thrown (a normal call error); an error in the
   * middle is sent as a chunk, the text already sent stays valid.
   * @returns {Promise<{ ok: boolean, modele?: string, jetonsEntree?: number, jetonsSortie?: number, raisonArret?: string|null, consulte?: boolean, sites?: Record<string, string> }>}
   */
  async function chatFlux(
    uid,
    donnees,
    { envoyerMorceau = async () => false, signal, enregistrer } = {},
  ) {
    const { messages } = valider(donnees, {
      messages: { type: "libre", requis: true, verifier: verifierMessagesChat },
    });
    const { fournisseur, modele, cle } = await preparerAppel(uid);
    const adaptateurFlux = fournisseurs[fournisseur].envoyerFlux;
    if (!adaptateurFlux) throw new ErreurFournisseur("fournisseur-indisponible");
    const contexte = await contexteSites(uid, messages);
    const debut = horloge();
    let texte = ""; // the whole answer, to know which sites it cites and to keep it
    try {
      const source = adaptateurFlux({
        cle,
        modele,
        systeme: contexte
          ? systemeChatAvecSites(contexte.lignes, contexte.lignesDossiers)
          : SYSTEME_CHAT,
        messages: sansReferences(messages),
        maxJetons: 1000,
        temperature: 0.5,
        signal,
      });
      const flux = (async function* () {
        for await (const e of source) {
          if (e.type === "texte") texte += e.delta;
          yield e;
        }
      })();
      const fin = await diffuser(flux, envoyerMorceau);
      const jetons = (fin?.jetonsEntree ?? 0) + (fin?.jetonsSortie ?? 0);
      journal({
        action: "chatFlux",
        fournisseur,
        modele,
        dureeMs: horloge() - debut,
        jetons,
        ...(fin?.type === "erreur" ? { code: fin.code } : {}),
        ...(signal?.aborted ? { annule: true } : {}),
      });
      await usageSvc?.enregistrer(uid, {
        usage: "chat",
        fournisseur,
        modele,
        jetonsEntree: fin?.jetonsEntree ?? 0,
        jetonsSortie: fin?.jetonsSortie ?? 0,
        incomplet: fin?.type !== "fin",
      });
      // A proposal is only taken from a complete answer; a cut one keeps its text, no actions.
      const complete = fin?.type === "fin";
      const separe = separerProposition(texte, contexte);
      const proposition = complete ? separe.proposition : null;
      const sites = contexte ? referencesCitees(separe.texte, contexte.table) : {};
      // The text is kept even when it stopped halfway (error, "Arrêter"): marked "interrompu".
      const enregistrerTexte = async (etat) =>
        separe.texte.trim()
          ? enregistrer?.({
              texte: referencesReelles(separe.texte, contexte?.table),
              etat,
              proposition,
              modele: fin?.modele ?? modele,
              jetons: fin?.jetonsEntree != null
                ? { entree: fin.jetonsEntree ?? 0, sortie: fin.jetonsSortie ?? 0 }
                : undefined,
              sitesCites: Object.values(sites),
            })
          : undefined;
      if (fin?.type !== "fin") {
        const messageId = await enregistrerTexte("interrompu");
        return { ok: false, ...(messageId ? { messageId } : {}) };
      }
      const messageId = await enregistrerTexte("ok");
      return {
        ok: true,
        ...(messageId ? { messageId } : {}),
        modele: fin.modele,
        jetonsEntree: fin.jetonsEntree,
        jetonsSortie: fin.jetonsSortie,
        raisonArret: fin.raisonArret ?? null,
        ...(contexte ? { consulte: true, sites } : {}),
        ...(proposition ? { proposition } : {}),
      };
    } catch (e) {
      journal({
        action: "chatFlux",
        fournisseur,
        modele,
        dureeMs: horloge() - debut,
        code: e?.code,
      });
      // A break in the middle (network, provider): what was written is kept as "interrompu".
      if (texte.trim()) {
        const { texte: partiel } = separerProposition(texte, contexte);
        const sites = contexte ? referencesCitees(partiel, contexte.table) : {};
        await enregistrer?.({
          texte: referencesReelles(partiel, contexte?.table),
          etat: "interrompu",
          modele,
          sitesCites: Object.values(sites),
        })?.catch?.(() => {});
      }
      throw e;
    }
  }

  /**
   * V4.17: tidying suggestions. The model answers with independent groups of actions
   * (creer_dossier, deplacer, renommer: never a deletion), validated like the proposals of the
   * chat; the browser shows each group with the same confirmation card. One retry on a bad format.
   */
  async function suggererRangement(uid, donnees) {
    const { portee } = valider(donnees, {
      portee: { type: "chaine", requis: true, valeurs: () => ["accueil", "tout"] },
    });
    const snap = await db.doc(`users/${uid}`).get();
    const conf = validerConfidentialite(snap.exists ? snap.data()?.reglages?.ia?.confidentialite : null);
    if (!permis(conf, "titresAdresses")) throw new ErreurFournisseur("confidentialite-sites");
    const grille = snap.exists ? snap.data()?.grille : [];
    let sites = sitesDe(grille);
    if (portee === "accueil") sites = sites.filter((s) => s.chemin.length === 0);
    // Nothing to tidy: no call, nothing paid.
    if (sites.length < 2) return { groupes: [] };
    const { lignes, table } = construireListe(sites.slice(0, 200), {
      champs: champsAutorises(conf).filter((c) => c !== "ajoute"),
    });
    const { lignes: lignesDossiers, table: tableDossiers } = construireListeDossiers(
      dossiersDe(grille),
    );
    const messages = [
      { role: "user", texte: messageRangement({ portee, lignes, lignesDossiers }) },
    ];
    for (let essai = 0; essai < 2; essai++) {
      const r = await executerUsage(uid, {
        usage: "rangement",
        systeme: SYSTEME_RANGEMENT,
        messages:
          essai === 0
            ? messages
            : [
                ...messages,
                { role: "assistant", texte: "..." },
                { role: "user", texte: RAPPEL_RANGEMENT },
              ],
        maxJetons: 3000,
        temperature: 0.3,
        formatJson: true,
      });
      const sortie = lireSortieRangement(r.texte, { sites: table, dossiers: tableDossiers });
      if (sortie) return { ...sortie, modele: r.modele };
    }
    throw new ErreurFournisseur("reponse-invalide");
  }

  /** V4.20: erases what the user asks (conversations, cache, statistics, or the three). */
  async function effacer(uid, donnees) {
    const { quoi } = valider(donnees, {
      quoi: { type: "chaine", requis: true, valeurs: () => EFFACEMENTS },
    });
    const sortie = await creerEffacements({ db }).effacer(uid, quoi);
    journal({ action: "effacer", quoi }); // never what was erased
    return sortie;
  }

  /** V4.19: usage of today, of the month and of the 11 months before, with the limits. */
  async function consommation(uid, donnees) {
    valider(donnees, {});
    if (!usageSvc) throw new EntreeInvalide("Statistiques indisponibles.");
    return usageSvc.consommation(uid);
  }

  // --- V4.15: conversations (the history comes from Firestore, never from the browser) ---------
  const conversations = creerConversations({ db, horloge });
  const schemaConversation = { convId: { type: "chaine", requis: true, motif: MOTIF_ID_CONVERSATION } };

  /** Titles of the sites of the grid by real id (only read when a past answer cites a site). */
  async function titresDeSites(uid) {
    const snap = await db.doc(`users/${uid}`).get();
    return new Map(sitesDe(snap.exists ? snap.data()?.grille : []).map((s) => [s.id, s.titre]));
  }

  /** The history of a conversation, references of past answers replaced by the site titles. */
  async function historiqueDe(uid, convId) {
    let titres = null;
    const brut = await conversations.historique(uid, convId);
    if (!brut.some((m) => m.role === "assistant" && m.texte.includes("[[site:"))) return brut;
    titres = await titresDeSites(uid);
    return brut.map((m) =>
      m.role === "assistant"
        ? {
            ...m,
            texte: m.texte.replace(/\[\[site:([^\]]*)\]\]/g, (_, id) =>
              titres.has(id) ? `« ${titres.get(id)} »` : "(site de la collection)",
            ),
          }
        : m,
    );
  }

  /** V4.15: answer of the chat for a conversation; the answer is written in its messages. */
  async function chatConversation(uid, donnees) {
    // V4.20: history not kept: the conversation stays in the browser, which sends it (as in V4.11).
    if (!permis(await confidentialiteDe(uid), "historique")) return chat(uid, donnees);
    const { convId } = valider(donnees, schemaConversation);
    const messages = await historiqueDe(uid, convId);
    return chat(
      uid,
      { messages },
      { enregistrer: (m) => conversations.enregistrerReponse(uid, convId, m) },
    );
  }

  /** V4.15: the same, streamed. */
  async function chatFluxConversation(uid, donnees, options = {}) {
    if (!permis(await confidentialiteDe(uid), "historique")) return chatFlux(uid, donnees, options);
    const { convId } = valider(donnees, schemaConversation);
    const messages = await historiqueDe(uid, convId);
    return chatFlux(uid, { messages }, {
      ...options,
      enregistrer: (m) => conversations.enregistrerReponse(uid, convId, m),
    });
  }

  /** V4.15: deletes a conversation with all its messages. */
  async function supprimerConversation(uid, donnees) {
    const { convId } = valider(donnees, schemaConversation);
    return conversations.supprimer(uid, convId);
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
    chat,
    chatFlux,
    suggererRangement,
    consommation,
    effacer,
    chatConversation,
    chatFluxConversation,
    supprimerConversation,
    enregistrerCle,
    supprimerCle,
    etatCles,
    tester,
    executerUsage,
    choixDeLUsage,
  };
}
