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
  actualiserVerification,
  ajouterMotDePasse,
  changerMotDePasse,
  connecterEmail,
  inscrireEmail,
  reauthentifierMotDePasse,
  reinitialiserMotDePasse,
  renvoyerVerification,
} from "./auth.email.js";
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
export { appelerIa, lireConfigIa } from "./ia.js";
export {
  chargerMessagesAvant,
  creerConversation,
  ecouterMessages,
  ecrireMessageUtilisateur,
  lireToutesConversations,
  listerConversations,
  majStatutProposition,
  renommerConversation,
  supprimerConversation,
  supprimerMessage,
} from "./conversations.js";
export { donneesChat, fluxAvecRepli, lireFluxChat } from "./iaFlux.js";
export { supprimerMonCompte } from "./suppression.js";
export {
  ajouterStats,
  ecouterVisites,
  effacerVisites,
  envoyerVisites,
  lireVisites,
  majServeur,
  retirerEntrees,
} from "./visites.js";
export {
  ajouter as ajouterAuPartage,
  ecouterCompteur as ecouterCompteurPartage,
  ecouterEspacePartage,
  epingler as epinglerPartage,
  lirePage as lirePagePartage,
  lireTout as lireToutLePartage,
  recalculerCompteur as recalculerCompteurPartage,
  remonter as remonterPartage,
  restaurer as restaurerPartage,
  supprimer as supprimerDuPartage,
  viderTout as viderLePartage,
} from "./espacePartage.js";
export {
  envoyerFichier as envoyerFichierPartage,
  lireFichier as lireFichierPartage,
  reconcilier as reconcilierPartage,
  supprimerFichier as supprimerFichierPartage,
} from "./espacePartageFichiers.js";
