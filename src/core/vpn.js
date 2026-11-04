/**
 * V5.2: pure helpers of the VPN settings screen (no DOM, no Firebase): messages, labels and the
 * shape of what the server sends back. Nothing here ever logs or stores a password.
 */
import { EMAIL_MAX, normaliserEmail, validerEmail } from "./authEmail.js";

export { EMAIL_MAX, normaliserEmail, validerEmail };

export const LIBELLE_RESERVE = "Le VPN est réservé aux personnes invitées par le propriétaire.";
export const AVERTISSEMENT_INVITATION =
  "Les personnes invitées sortent sur Internet avec l'adresse de votre serveur. N'invitez que des personnes de confiance.";
/** The password shown on screen disappears after this delay. */
export const DUREE_AFFICHAGE_MDP_MS = 60_000;

export const LIBELLES_STATUT = {
  en_attente: "En attente de connexion",
  acceptee: "Accès accordé",
  revoquee: "Accès retiré",
};

/** "acceptee" without an active access (just removed or account deleted) is shown as removed. */
export function libelleInvite({ statut, acces }) {
  if (statut === "acceptee" && !acces) return LIBELLES_STATUT.revoquee;
  return LIBELLES_STATUT[statut] ?? "Inconnu";
}

const PAR_CODE = {
  "functions/unauthenticated": "Connectez-vous pour utiliser le VPN.",
  "functions/permission-denied": LIBELLE_RESERVE,
  "functions/resource-exhausted": "Trop de demandes aujourd'hui, réessayez demain.",
  "functions/failed-precondition": "Le VPN n'est pas disponible pour le moment.",
  "functions/invalid-argument": "Adresse e-mail invalide.",
  "functions/not-found": "Invité introuvable.",
  "functions/unavailable": "Service indisponible : vérifiez votre connexion.",
  "functions/deadline-exceeded": "Le service a mis trop de temps à répondre.",
};

/** @param {{ code?: string }} e */
export const messageErreurVpn = (e) =>
  PAR_CODE[e?.code] ?? "Le VPN est indisponible pour l'instant.";

/**
 * "domain:port" as the proxy settings expect it; a missing port means 443.
 * @param {{ domaine: string, port?: number }} acces
 */
export const adresseProxy = ({ domaine, port }) => `${domaine}:${port ?? 443}`;

/**
 * What the screen keeps of an access answer: only the fields it shows. Anything else the server
 * might add is dropped, and a malformed answer gives null (nothing is shown).
 */
export function lireAcces(donnees) {
  const d = donnees ?? {};
  if (![d.domaine, d.compte, d.motDePasse].every((v) => typeof v === "string" && v)) return null;
  return {
    domaine: d.domaine,
    port: Number.isInteger(d.port) ? d.port : 443,
    compte: d.compte,
    motDePasse: d.motDePasse,
    pays: typeof d.pays === "string" ? d.pays : null,
  };
}
