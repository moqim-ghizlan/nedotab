/**
 * AI settings (V4.1): pure rules, shared by the reducer, the loader and the settings screen.
 *
 * reglages.ia = {
 *   actif: boolean,                                           (off by default)
 *   usages: { tags, recherche, chat }: { fournisseur, modele } | null,
 *   modelesPerso: [{ fournisseur, id, nom, ajouteLe }],       (at most 20)
 * }
 * Stored only when it differs from the default. The keys are never here: they live on the
 * server, encrypted (V4.0); only their state (provider, last 4 characters) is read from it.
 */
export const USAGES = ["tags", "recherche", "chat"];
export const LIBELLES_USAGES = { tags: "Tags", recherche: "Recherche", chat: "Discussion" };
/** Providers the code can call; the ones offered to users are decided by config/ia. */
export const FOURNISSEURS = ["openai", "gemini"];
export const MODELES_PERSO_MAX = 20;

const ID_MODELE = /^[A-Za-z0-9._:/@-]{1,100}$/;
const NOM_MAX = 40;

export const iaParDefaut = () => ({
  actif: false,
  usages: { tags: null, recherche: null, chat: null },
  modelesPerso: [],
});

const entier = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** { fournisseur, id, nom, ajouteLe } made valid, or null. */
export function validerModelePerso(m) {
  if (!m || typeof m !== "object") return null;
  if (!FOURNISSEURS.includes(m.fournisseur)) return null;
  if (typeof m.id !== "string" || !ID_MODELE.test(m.id)) return null;
  const nom = typeof m.nom === "string" ? m.nom.trim() : "";
  if (nom.length < 1 || nom.length > NOM_MAX) return null;
  return { fournisseur: m.fournisseur, id: m.id, nom, ajouteLe: entier(m.ajouteLe) };
}

/** { fournisseur, modele } made valid, or null (= "not defined"). */
function validerChoix(c) {
  if (!c || typeof c !== "object") return null;
  if (!FOURNISSEURS.includes(c.fournisseur)) return null;
  if (typeof c.modele !== "string" || !ID_MODELE.test(c.modele)) return null;
  return { fournisseur: c.fournisseur, modele: c.modele };
}

/** Valid, complete settings (anything wrong falls back to the default). */
export function validerIa(ia) {
  const r = ia && typeof ia === "object" ? ia : {};
  const perso = [];
  for (const m of Array.isArray(r.modelesPerso) ? r.modelesPerso : []) {
    const v = validerModelePerso(m);
    if (
      v &&
      perso.length < MODELES_PERSO_MAX &&
      !perso.some((p) => memeModele(p, v.fournisseur, v.id))
    )
      perso.push(v);
  }
  const usages = {};
  for (const u of USAGES) usages[u] = validerChoix(r.usages?.[u]);
  return { actif: r.actif === true, usages, modelesPerso: perso };
}

const memeModele = (m, fournisseur, id) => m.fournisseur === fournisseur && m.id === id;

/** True when the settings are the default: nothing needs to be stored. */
export const estIaParDefaut = (ia) =>
  JSON.stringify(validerIa(ia)) === JSON.stringify(iaParDefaut());

/** What is stored: nothing for the default settings. */
export const iaAStocker = (ia) => (estIaParDefaut(ia) ? undefined : validerIa(ia));

/** The settings of a state, complete. */
export const iaDe = (reglages) => validerIa(reglages?.ia);

// --- changes (each returns the new settings, or the same object when refused) ---------------

export const avecActif = (ia, actif) => ({ ...ia, actif: actif === true });

/** `choix`: { fournisseur, modele } or null to unset. */
export function avecUsage(ia, usage, choix) {
  if (!USAGES.includes(usage)) return ia;
  const valide = choix == null ? null : validerChoix(choix);
  if (choix != null && !valide) return ia;
  return { ...ia, usages: { ...ia.usages, [usage]: valide } };
}

export function avecModelePerso(ia, modele) {
  const v = validerModelePerso(modele);
  if (!v || ia.modelesPerso.length >= MODELES_PERSO_MAX) return ia;
  if (ia.modelesPerso.some((m) => memeModele(m, v.fournisseur, v.id))) return ia;
  return { ...ia, modelesPerso: [...ia.modelesPerso, v] };
}

/** Removes a custom model; a use that was set to it goes back to "not defined". */
export function sansModelePerso(ia, fournisseur, id) {
  if (!ia.modelesPerso.some((m) => memeModele(m, fournisseur, id))) return ia;
  const usages = {};
  for (const u of USAGES) {
    const c = ia.usages[u];
    usages[u] = c && c.fournisseur === fournisseur && c.modele === id ? null : c;
  }
  return {
    ...ia,
    usages,
    modelesPerso: ia.modelesPerso.filter((m) => !memeModele(m, fournisseur, id)),
  };
}

/** The use of a model by its owner: which uses point to it. */
export const usagesDuModele = (ia, fournisseur, id) =>
  USAGES.filter((u) => ia.usages[u]?.fournisseur === fournisseur && ia.usages[u]?.modele === id);

/**
 * Recommendations in one click: for each use, the model that config/ia recommends for it
 * among the providers the user has a key for. Unset uses stay unset.
 * @param {Array<{ fournisseur: string, id: string, recommandePour?: string }>} suggeres
 * @param {string[]} fournisseursAvecCle
 */
export function avecRecommandations(ia, suggeres, fournisseursAvecCle) {
  let suivant = ia;
  for (const usage of USAGES) {
    const m = (suggeres ?? []).find(
      (s) => s.recommandePour === usage && fournisseursAvecCle.includes(s.fournisseur),
    );
    if (m) suivant = avecUsage(suivant, usage, { fournisseur: m.fournisseur, modele: m.id });
  }
  return suivant;
}

/**
 * Is the AI ready for `usage`? Used by every AI feature to show itself or to say what to do.
 * @param {{ ia: object, usage: string, modeCompte: boolean, enLigne: boolean,
 *           cles: Array<{ fournisseur: string, valide: boolean|null }> }} contexte
 * @returns {{ prete: boolean, raison?: "mode-local"|"desactivee"|"pas-de-cle"|"pas-de-modele"|"hors-ligne" }}
 */
export function iaPrete({ ia, usage, modeCompte, enLigne, cles }) {
  if (!modeCompte) return { prete: false, raison: "mode-local" };
  const reglages = validerIa(ia);
  if (!reglages.actif) return { prete: false, raison: "desactivee" };
  const choix = reglages.usages[usage] ?? null;
  if (!choix) return { prete: false, raison: "pas-de-modele" };
  const cle = (cles ?? []).find((c) => c.fournisseur === choix.fournisseur);
  if (!cle || cle.valide === false) return { prete: false, raison: "pas-de-cle" };
  if (!enLigne) return { prete: false, raison: "hors-ligne" };
  return { prete: true };
}

/** What to tell the user (and where to go) for each reason. */
export const EXPLICATIONS_IA = {
  "mode-local": "Connectez-vous pour utiliser l'assistant.",
  desactivee: "L'assistant IA est désactivé : activez-le dans les réglages.",
  "pas-de-cle": "Ajoutez votre clé du fournisseur dans les réglages de l'assistant.",
  "pas-de-modele": "Choisissez un modèle pour cet usage dans les réglages de l'assistant.",
  "hors-ligne": "L'assistant IA a besoin d'une connexion.",
};
