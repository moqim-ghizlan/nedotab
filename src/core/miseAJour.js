/** Intervalle minimal entre deux recherches de nouvelle version (V3.7). */
export const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000;

/**
 * Peut-on lancer le rechargement maintenant ? Jamais pendant que l'utilisateur fait quelque
 * chose : fenêtre ouverte, glisser en cours, saisie dans un champ.
 * @param {{ fenetreOuverte: boolean, glisserEnCours: boolean, saisieEnCours: boolean }} contexte
 */
export function peutRecharger({ fenetreOuverte, glisserEnCours, saisieEnCours }) {
  return !fenetreOuverte && !glisserEnCours && !saisieEnCours;
}

/**
 * Pourquoi le rechargement doit attendre, ou null s'il peut avoir lieu : le message affiché
 * à l'utilisateur est choisi par l'interface selon cette raison.
 * @returns {null | "fenetre" | "glisser" | "saisie"}
 */
export function raisonOccupe({ fenetreOuverte, glisserEnCours, saisieEnCours }) {
  if (fenetreOuverte) return "fenetre";
  if (glisserEnCours) return "glisser";
  if (saisieEnCours) return "saisie";
  return null;
}

/** Faut-il chercher une nouvelle version maintenant, au retour au premier plan ? (1 fois/heure) */
export function doitVerifier(derniereVerification, maintenant) {
  return maintenant - derniereVerification >= INTERVALLE_VERIFICATION_MS;
}
