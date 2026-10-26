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

/** Faut-il chercher une nouvelle version maintenant, au retour au premier plan ? (1 fois/heure) */
export function doitVerifier(derniereVerification, maintenant) {
  return maintenant - derniereVerification >= INTERVALLE_VERIFICATION_MS;
}
