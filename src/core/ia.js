/**
 * AI settings (V4.1): pure rules, shared by the reducer, the loader and the settings screen.
 *
 * reglages.ia = { actif: boolean, questionBarre?: "sites"|"chat" }   (off by default; V4.13:
 * where a question asked in the search bar goes, absent = automatic; V4.14: sitesChat
 * "toujours"|"jamais", whether the chat may read the user's sites, absent = when useful)
 * The provider (Gemini) and the model are imposed by the server (config/ia): the user only
 * switches the assistant on and gives their key. Fields left by older versions (usages,
 * modelesPerso) are ignored and dropped on the next save. Stored only when it differs from
 * the default. The keys are never here: they live on the server, encrypted (V4.0); only
 * their state (provider, last 4 characters) is read from it.
 */
import { validerModeSitesChat } from "./besoinContexteSites.js";
import { validerConfidentialite } from "./confidentialiteIa.js";
import { validerLimites } from "./estimation.js";
import { validerPreference } from "./routageQuestion.js";

export const USAGES = ["tags", "recherche", "chat"];
export const LIBELLES_USAGES = { tags: "Tags", recherche: "Recherche", chat: "Discussion" };
/** Providers the code can call; the ones offered to users are decided by config/ia. */
export const FOURNISSEURS = ["gemini"];

export const iaParDefaut = () => ({ actif: false });

/** Valid, complete settings (anything wrong falls back to the default). */
export function validerIa(ia) {
  const resultat = { actif: ia?.actif === true };
  const question = validerPreference(ia?.questionBarre);
  if (question !== "auto") resultat.questionBarre = question;
  const confidentialite = validerConfidentialite(ia?.confidentialite); // V4.20
  if (confidentialite) resultat.confidentialite = confidentialite;
  const limites = validerLimites(ia?.limites); // V4.19: personal limits (day / month)
  if (limites) resultat.limites = limites;
  const sitesChat = validerModeSitesChat(ia?.sitesChat);
  if (sitesChat !== "auto") resultat.sitesChat = sitesChat;
  // V4.6: light lock of the catch-up between devices (who, last progress).
  const r = ia?.rattrapage;
  if (typeof r?.appareil === "string" && r.appareil.length <= 64 && Number.isFinite(r.maj))
    resultat.rattrapage = { appareil: r.appareil, maj: r.maj };
  return resultat;
}

/** True when the settings are the default: nothing needs to be stored. */
export const estIaParDefaut = (ia) => {
  const v = validerIa(ia);
  return !v.actif && !v.rattrapage && !v.questionBarre && !v.sitesChat && !v.limites && !v.confidentialite;
};

/** What is stored: nothing for the default settings. */
export const iaAStocker = (ia) => (estIaParDefaut(ia) ? undefined : validerIa(ia));

/** The settings of a state, complete. */
export const iaDe = (reglages) => validerIa(reglages?.ia);

/** The place of the questions of the bar ("auto" removes the field). */
export const avecQuestionBarre = (ia, valeur) => {
  const reste = { ...ia };
  delete reste.questionBarre;
  const p = validerPreference(valeur);
  return p === "auto" ? reste : { ...reste, questionBarre: p };
};

/** V4.14: whether the chat may read the sites ("auto" removes the field). */
export const avecSitesChat = (ia, valeur) => {
  const reste = { ...ia };
  delete reste.sitesChat;
  const m = validerModeSitesChat(valeur);
  return m === "auto" ? reste : { ...reste, sitesChat: m };
};

/** V4.19: the personal limits (null or empty removes them). */
export const avecLimites = (ia, limites) => {
  const reste = { ...ia };
  delete reste.limites;
  const l = validerLimites(limites);
  return l ? { ...reste, limites: l } : reste;
};

/** V4.20: one privacy choice (true = allowed, the default, removes the field). */
export const avecConfidentialite = (ia, cle, autorise) => {
  const reste = { ...ia };
  const actuel = { ...(reste.confidentialite ?? {}) };
  if (autorise) delete actuel[cle];
  else actuel[cle] = false;
  delete reste.confidentialite;
  const c = validerConfidentialite(actuel);
  return c ? { ...reste, confidentialite: c } : reste;
};

export const avecActif = (ia, actif) => ({ ...ia, actif: actif === true });

/** The lock set (or removed with null) by the device that processes. */
export const avecRattrapage = (ia, verrou) => {
  const reste = { ...ia };
  delete reste.rattrapage;
  return verrou ? { ...reste, rattrapage: verrou } : reste;
};

/**
 * Is the AI ready? Used by every AI feature to show itself or to say what to do.
 * @param {{ ia: object, usage?: string, modeCompte: boolean, enLigne: boolean,
 *           cles: Array<{ fournisseur: string, valide: boolean|null }> }} contexte
 * @returns {{ prete: boolean, raison?: "mode-local"|"desactivee"|"pas-de-cle"|"hors-ligne" }}
 */
export function iaPrete({ ia, modeCompte, enLigne, cles }) {
  if (!modeCompte) return { prete: false, raison: "mode-local" };
  if (!validerIa(ia).actif) return { prete: false, raison: "desactivee" };
  const cle = (cles ?? []).find((c) => FOURNISSEURS.includes(c.fournisseur));
  if (!cle || cle.valide === false) return { prete: false, raison: "pas-de-cle" };
  if (!enLigne) return { prete: false, raison: "hors-ligne" };
  return { prete: true };
}

/** What to tell the user (and where to go) for each reason. */
export const EXPLICATIONS_IA = {
  "mode-local": "Connectez-vous pour utiliser l'assistant.",
  desactivee: "L'assistant IA est désactivé : activez-le dans les réglages.",
  "pas-de-cle": "Ajoutez votre clé Gemini dans les réglages de l'assistant.",
  "hors-ligne": "L'assistant IA a besoin d'une connexion.",
};
