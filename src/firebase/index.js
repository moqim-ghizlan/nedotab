/**
 * Entry point of everything Firebase. Never imported statically by the page: it is loaded
 * on demand (see charger.js), so a user without an account never downloads Firebase.
 */
export { cacheHorsLigneDisponible, obtenirApp } from "./app.js";
export { lireConfig } from "./config.js";
export {
  connecter,
  deconnecter,
  ecouterUtilisateur,
  obtenirAuth,
  profil,
  reconnecterPourConfirmer,
  terminerConnexion,
} from "#auth";
export {
  ecouterDocument,
  ecrireDocument,
  ecrireParTransaction,
  effacerCache,
  reseau,
  lireDocument,
} from "./donnees.js";
export {
  cheminFond,
  envoyerFond,
  listerFondsStockage,
  supprimerFondStockage,
  telechargerFond,
} from "./fichiers.js";
export {
  compterManuelles,
  creerSauvegarde,
  derniereAuto,
  listerSauvegardes,
  rotation,
  sauvegarderAvantRemplacement,
  supprimerSauvegarde,
} from "./sauvegardes.js";
export { supprimerMonCompte } from "./suppression.js";
