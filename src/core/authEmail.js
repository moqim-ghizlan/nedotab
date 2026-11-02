/**
 * Sign-in with an e-mail address and a password (V4.23). Pure: validation, normalisation and
 * the French messages of the Firebase error codes. No password is ever stored or logged here.
 */

/** Decision 2 of the plan: 10 characters, no complexity rule imposed. */
export const MOT_DE_PASSE_MIN = 10;
export const MOT_DE_PASSE_MAX = 128;
export const EMAIL_MAX = 254;

/** Lower case, no surrounding space (also used to compare with the VPN guest list, V5.2). */
export const normaliserEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

const FORME_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** @returns {string|null} an error message, or null when the address is acceptable. */
export function validerEmail(email) {
  const e = normaliserEmail(email);
  if (!e) return "Saisissez votre adresse e-mail.";
  if (e.length > EMAIL_MAX || !FORME_EMAIL.test(e)) return "Cette adresse e-mail n'est pas valide.";
  return null;
}

/**
 * @param {string} mdp
 * @returns {string|null} an error message, or null when the password is acceptable.
 * Only the length counts (no rule of complexity), but a blank password is refused.
 */
export function validerMotDePasse(mdp) {
  const m = String(mdp ?? "");
  if (!m) return "Saisissez un mot de passe.";
  if ([...m].length < MOT_DE_PASSE_MIN)
    return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if ([...m].length > MOT_DE_PASSE_MAX)
    return `Le mot de passe ne peut pas dépasser ${MOT_DE_PASSE_MAX} caractères.`;
  if (m.trim() === "") return "Le mot de passe ne peut pas être fait d'espaces.";
  return null;
}

const GENERIQUE_IDENTIFIANTS = "Adresse e-mail ou mot de passe incorrect.";

/**
 * Codes → messages. "Unknown e-mail" and "wrong password" give the SAME message: nothing tells
 * whether an account exists (and with e-mail enumeration protection Firebase answers
 * auth/invalid-credential for both).
 */
export const MESSAGES_ERREUR_AUTH = {
  "auth/wrong-password": GENERIQUE_IDENTIFIANTS,
  "auth/user-not-found": GENERIQUE_IDENTIFIANTS,
  "auth/invalid-credential": GENERIQUE_IDENTIFIANTS,
  "auth/invalid-login-credentials": GENERIQUE_IDENTIFIANTS,
  "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
  "auth/missing-email": "Saisissez votre adresse e-mail.",
  "auth/missing-password": "Saisissez un mot de passe.",
  "auth/weak-password": `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`,
  "auth/email-already-in-use":
    "Cet email est déjà utilisé avec Google. Connectez-vous avec Google, vous pourrez ensuite ajouter un mot de passe dans les réglages.",
  "auth/account-exists-with-different-credential":
    "Un compte existe déjà avec cette adresse. Connectez-vous avec votre mot de passe, puis liez Google dans les réglages.",
  "auth/credential-already-in-use": "Ce compte est déjà utilisé par une autre personne.",
  "auth/provider-already-linked": "Un mot de passe est déjà associé à ce compte.",
  "auth/too-many-requests":
    "Trop d'essais. Patientez quelques minutes avant de réessayer, ou réinitialisez votre mot de passe.",
  "auth/requires-recent-login": "Confirmez votre identité pour continuer.",
  "auth/user-mismatch": "Ces identifiants ne correspondent pas au compte connecté.",
  "auth/user-disabled": "Ce compte est désactivé.",
  "auth/network-request-failed": "Connexion internet nécessaire. Réessayez une fois en ligne.",
  "auth/operation-not-allowed":
    "La connexion par e-mail n'est pas activée pour l'instant. Utilisez Google.",
  "auth/popup-closed-by-user": "La fenêtre a été fermée avant la fin.",
  "auth/cancelled-popup-request": "La fenêtre a été fermée avant la fin.",
  "auth/unauthorized-domain": "La connexion n'est pas autorisée sur cette adresse.",
  "auth/invalid-action-code": "Ce lien n'est plus valable. Demandez-en un nouveau.",
  "auth/expired-action-code": "Ce lien a expiré. Demandez-en un nouveau.",
};

/** A readable French message for a Firebase Auth error (never reveals if an account exists). */
export function traduireErreurAuth(erreurOuCode) {
  const code = typeof erreurOuCode === "string" ? erreurOuCode : erreurOuCode?.code;
  return (
    MESSAGES_ERREUR_AUTH[code] ??
    `La connexion a échoué. Réessayez.${code ? ` (${code})` : ""}`
  );
}

/** Sign-in methods of a user (providerData ids) as the settings show them. */
export function methodesDeConnexion(fournisseurs) {
  const ids = new Set((fournisseurs ?? []).map((f) => (typeof f === "string" ? f : f?.providerId)));
  const google = ids.has("google.com");
  const motDePasse = ids.has("password");
  return { google, motDePasse };
}

/** "Google", "E-mail et mot de passe" or both. */
export function libelleMethodes({ google, motDePasse }) {
  if (google && motDePasse) return "Google et mot de passe";
  if (motDePasse) return "E-mail et mot de passe";
  if (google) return "Google";
  return "";
}

/**
 * One resend of the verification e-mail per minute, on the interface side (Firebase has its
 * own ceiling). @returns {number} seconds to wait (0 = allowed).
 */
export function attenteRenvoi(dernierEnvoiMs, maintenant = Date.now(), delaiMs = 60_000) {
  if (!Number.isFinite(dernierEnvoiMs)) return 0;
  return Math.max(0, Math.ceil((dernierEnvoiMs + delaiMs - maintenant) / 1000));
}
