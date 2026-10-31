/**
 * Where a question asked in the search bar goes (V4.13). Pure: no DOM, no network.
 *
 * The local rules come first, so that the model is not asked to route a question the words
 * already settle:
 *   "chat"      a general question (how, why, write, translate…, or none of its words is in
 *               the user's sites): sent straight to the chat, no call to the smart search;
 *   "site"      the user looks for one of their sites: the smart search answers;
 *   "incertain" the smart search decides ("site", "question" or "les_deux", prompt v3).
 * The user can also force one side in the settings (`PREFERENCES_QUESTION`).
 */
import { normaliser } from "./recherche.js";

export const PREFERENCES_QUESTION = ["auto", "sites", "chat"];
export const PREFERENCE_PAR_DEFAUT = "auto";
export const LIBELLES_PREFERENCES = {
  auto: "Automatique",
  sites: "Toujours chercher dans mes sites",
  chat: "Toujours ouvrir le chat",
};

export const validerPreference = (v) =>
  PREFERENCES_QUESTION.includes(v) ? v : PREFERENCE_PAR_DEFAUT;

/** Normalised, with apostrophes and hyphens as spaces ("qu'est-ce que" → "qu est ce que"). */
const simplifier = (texte) => normaliser(String(texte ?? "").replace(/[’'`´-]/g, " "));

const VERBES_CHAT = String.raw`comment|pourquoi|qu est ce|c est quoi|ecris|ecrire|redige|rediger|traduis|traduire|calcule|calculer|explique|expliquer|resume|resumer|genere|generer|corrige|corriger|combien|quelle est la difference|difference entre|what|how|why|write|translate|explain`;
const DEBUT_CHAT = new RegExp(String.raw`^(?:${VERBES_CHAT})\b`);
const CHAT_PLUS_LOIN = new RegExp(
  String.raw`\b(?:comment|pourquoi|explique|ecris|traduis|calcule|how|why)\b`,
);

const MARQUEURS_SITE = new RegExp(
  String.raw`\b(?:mon site|mes sites|mon outil|mes outils|mon lien|mes liens|mon dossier|mes dossiers|mes favoris|mon favori|j ai (?:ajoute|enregistre|sauvegarde|mis)|ai je (?:ajoute|enregistre|sauvegarde)|ou est mon|ou sont mes|montre moi mes|quel site|quels sites|quel outil|quels outils|retrouve|le site (?:de|du|des|d)|l outil (?:de|du|des|pour|d))\b`,
);

const MOTS_VIDES = new Set(
  (
    "le la les un une des du de d l et ou a au aux en dans sur pour par avec sans que qui quoi " +
    "est sont ai as a ont j je tu il elle on nous vous ils mon ma mes ton ta tes son sa ses " +
    "ce cet cette ces se ne pas plus ca qu faire fait peux peut veux voudrais veut " +
    "the of to and for with how what"
  ).split(" "),
);

/** Words of a question that can say something about a site (no stop words, 3+ letters). */
export function motsUtiles(question) {
  return simplifier(question)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
}

const vocabulaires = new WeakMap();

/** Every word of the titles, domains, tags, folders and descriptions of the sites. */
function vocabulaire(index) {
  let v = vocabulaires.get(index);
  if (!v) {
    v = new Set();
    for (const e of index) {
      const champs = [e.titreNorm, e.domaineNorm, e.cheminNorm, e.descriptionNorm, ...e.tagsNorm];
      for (const c of champs)
        for (const m of String(c ?? "").split(/[^a-z0-9]+/)) if (m.length >= 3) v.add(m);
    }
    vocabulaires.set(index, v);
  }
  return v;
}

/** A word is in the sites: as it is, singular, or as the start of a longer word. */
function dansLesSites(mot, vocab) {
  if (vocab.has(mot) || vocab.has(mot.replace(/[sx]$/, ""))) return true;
  if (mot.length < 5) return false;
  const racine = mot.slice(0, -1);
  for (const m of vocab) if (m.startsWith(racine)) return true;
  return false;
}

/**
 * @param {string} question
 * @param {object[]} index search index of the grid (`indexer(grille)`)
 * @returns {{ vers: "chat"|"site"|"incertain", motif: string }}
 */
export function decisionLocale(question, index) {
  const q = simplifier(question);
  const chatDebut = DEBUT_CHAT.test(q);
  if (MARQUEURS_SITE.test(q)) {
    // "which site do I use for invoices and how do I write one": the model says both.
    return CHAT_PLUS_LOIN.test(q) && !chatDebut
      ? { vers: "incertain", motif: "site-et-question" }
      : { vers: "site", motif: "marqueur-site" };
  }
  if (chatDebut) return { vers: "chat", motif: "verbe-question" };
  const mots = motsUtiles(question);
  const vocab = vocabulaire(index);
  if (mots.length === 0 || !mots.some((m) => dansLesSites(m, vocab)))
    return { vers: "chat", motif: "aucun-mot-dans-les-sites" };
  return { vers: "incertain", motif: "mots-dans-les-sites" };
}

/** The decision, with the user's preference first: "sites" and "chat" skip every rule. */
export function decider(question, { preference = PREFERENCE_PAR_DEFAUT, index = [] } = {}) {
  const p = validerPreference(preference);
  if (p === "sites") return { vers: "site", motif: "preference" };
  if (p === "chat") return { vers: "chat", motif: "preference" };
  return decisionLocale(question, index);
}

/** The intentions the smart search may return (prompt v3); anything else is "site". */
export const INTENTIONS = ["site", "question", "les_deux"];
export const intentionValide = (v) => (INTENTIONS.includes(v) ? v : "site");
