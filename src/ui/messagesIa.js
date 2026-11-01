/**
 * What the user reads when an AI function fails (V4.0). The server sends a callable code and
 * `details.code`, the precise reason; the text is chosen here.
 */
const PAR_RAISON = {
  "cle-invalide": "Clé refusée par le fournisseur : vérifiez-la (copiée en entier ?).",
  "cle-sans-credit": "Cette clé n'a plus de crédit chez le fournisseur.",
  "cle-absente": "Enregistrez d'abord une clé pour ce fournisseur.",
  "limite-fournisseur": "Le fournisseur reçoit trop de demandes : réessayez dans un instant.",
  "requete-invalide": "Demande refusée par le fournisseur.",
  "modele-introuvable": "Le modèle de l'assistant n'est pas disponible avec votre clé.",
  "pas-de-modele": "Aucun fournisseur d'IA n'est disponible pour l'instant.",
  "ia-desactivee": "L'assistant IA est désactivé : activez-le dans les réglages.",
  "reponse-invalide": "La réponse de l'IA était inutilisable : réessayez.",
  "fournisseur-indisponible": "Le fournisseur ne répond pas : réessayez plus tard.",
  "limite-personnelle": "Votre limite personnelle est atteinte : ajustez-la dans Réglages → Assistant IA → Consommation.",
  "confidentialite-sites": "L'envoi des titres et adresses de vos sites est désactivé : réactivez-le dans Réglages → Assistant IA → Confidentialité.",
  "lecture-serveur-desactivee": "La lecture des pages par le serveur est désactivée dans vos réglages de confidentialité.",
  "conversation-introuvable": "Cette conversation n'existe plus : commencez-en une nouvelle.",
  "conversation-pleine": "Cette conversation est pleine (200 messages) : commencez-en une nouvelle.",
  "conversation-sans-question": "Aucune question à envoyer dans cette conversation.",
  "entree-invalide": "Données refusées : vérifiez ce que vous avez saisi.",
};

const PAR_CODE = {
  "functions/unauthenticated": "Connectez-vous pour utiliser l'IA.",
  "functions/resource-exhausted": null, // the server's message says the limit and when it resets
  "functions/unavailable": "Service indisponible : vérifiez votre connexion.",
  "functions/deadline-exceeded": "Le service a mis trop de temps à répondre.",
  "functions/internal": "Erreur du service : réessayez plus tard.",
};

/** @param {{ code?: string, message?: string, details?: { code?: string } }} e */
export function messageErreurIa(e) {
  const raison = e?.details?.code;
  if (raison && PAR_RAISON[raison]) return PAR_RAISON[raison];
  if (e?.code in PAR_CODE) return PAR_CODE[e.code] ?? e.message;
  return "L'IA est indisponible pour l'instant.";
}
