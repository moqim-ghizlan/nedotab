/**
 * AI settings (V4.1): pure rules, shared by the reducer, the loader and the settings screen.
 *
 * reglages.ia = { actif: boolean }                              (off by default)
 * The provider (Gemini) and the model are imposed by the server (config/ia): the user only
 * switches the assistant on and gives their key. Fields left by older versions (usages,
 * modelesPerso) are ignored and dropped on the next save. Stored only when it differs from
 * the default. The keys are never here: they live on the server, encrypted (V4.0); only
 * their state (provider, last 4 characters) is read from it.
 */
export const USAGES = ["tags", "recherche", "chat"];
export const LIBELLES_USAGES = { tags: "Tags", recherche: "Recherche", chat: "Discussion" };
/** Providers the code can call; the ones offered to users are decided by config/ia. */
export const FOURNISSEURS = ["gemini"];

export const iaParDefaut = () => ({ actif: false });

/** Valid, complete settings (anything wrong falls back to the default). */
export function validerIa(ia) {
  return { actif: ia?.actif === true };
}

/** True when the settings are the default: nothing needs to be stored. */
export const estIaParDefaut = (ia) => !validerIa(ia).actif;

/** What is stored: nothing for the default settings. */
export const iaAStocker = (ia) => (estIaParDefaut(ia) ? undefined : validerIa(ia));

/** The settings of a state, complete. */
export const iaDe = (reglages) => validerIa(reglages?.ia);

export const avecActif = (ia, actif) => ({ ...ia, actif: actif === true });

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
