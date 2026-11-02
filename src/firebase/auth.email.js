import { normaliserEmail, validerEmail, validerMotDePasse } from "../core/authEmail.js";
import { obtenirAuth, outilsEmail, profil } from "#auth";

/**
 * Sign-in with e-mail and password (V4.23): thin functions over the SDK, one implementation
 * for the extension and the web app (the SDK entry of each target comes through "#auth").
 * No `chrome.*` here. A password is only ever an argument: never stored, logged or returned.
 *
 * An account whose e-mail is not verified gets NO access to the data (the rules require
 * `email_verified`); it can only verify, resend the e-mail or sign out.
 */
export function creerAuthEmail({ auth = obtenirAuth, sdk = outilsEmail, versProfil = profil } = {}) {
  const utilisateur = () => {
    const u = auth().currentUser;
    if (!u) throw Object.assign(new Error("Aucun utilisateur connecté"), { code: "auth/no-user" });
    return u;
  };
  const refuser = (message, code) => Object.assign(new Error(message), { code });

  /** Creates the account and sends the verification e-mail. @returns {Promise<object>} profile */
  async function inscrire(email, mdp) {
    const e = validerEmail(email);
    if (e) throw refuser(e, "auth/invalid-email");
    const m = validerMotDePasse(mdp);
    if (m) throw refuser(m, "auth/weak-password");
    const r = await sdk.createUserWithEmailAndPassword(auth(), normaliserEmail(email), mdp);
    await sdk.sendEmailVerification(r.user);
    return versProfil(r.user);
  }

  /** @returns {Promise<object>} profile (emailVerifie may be false: verification screen). */
  async function connecter(email, mdp) {
    const e = validerEmail(email);
    if (e) throw refuser(e, "auth/invalid-email");
    if (!mdp) throw refuser("Saisissez un mot de passe.", "auth/missing-password");
    const r = await sdk.signInWithEmailAndPassword(auth(), normaliserEmail(email), mdp);
    return versProfil(r.user);
  }

  const renvoyerVerification = () => sdk.sendEmailVerification(utilisateur());

  /**
   * "J'ai vérifié": reloads the user and refreshes the token, because `email_verified` of the
   * token only changes after getIdToken(true).
   */
  async function actualiserVerification() {
    const u = utilisateur();
    await u.reload();
    if (u.emailVerified) await u.getIdToken(true);
    return versProfil(u);
  }

  /** Sends the reset e-mail. With e-mail enumeration protection an unknown address is silent. */
  async function reinitialiser(email) {
    const e = validerEmail(email);
    if (e) throw refuser(e, "auth/invalid-email");
    await sdk.sendPasswordResetEmail(auth(), normaliserEmail(email));
  }

  /** Confirms the identity of an e-mail account; the token is refreshed (recent sign-in). */
  async function reauthentifier(mdp) {
    const u = utilisateur();
    const credential = sdk.EmailAuthProvider.credential(u.email, mdp);
    await sdk.reauthenticateWithCredential(u, credential);
    await u.getIdToken(true);
  }

  /**
   * Adds a password to a Google account (same uid: no data moves). The caller re-authenticated
   * with Google just before.
   */
  async function ajouterMotDePasse(mdp) {
    const m = validerMotDePasse(mdp);
    if (m) throw refuser(m, "auth/weak-password");
    const u = utilisateur();
    try {
      await sdk.linkWithCredential(u, sdk.EmailAuthProvider.credential(u.email, mdp));
    } catch (e) {
      // The address is already this account's own (Google): some backends then refuse to link
      // it a second time. Setting the password of the signed-in user adds the same method.
      if (e?.code !== "auth/email-already-in-use") throw e;
      await sdk.updatePassword(u, mdp);
    }
    await u.reload();
    return versProfil(u);
  }

  /** Changes the password after re-authenticating with the current one. */
  async function changerMotDePasse(ancien, nouveau) {
    const m = validerMotDePasse(nouveau);
    if (m) throw refuser(m, "auth/weak-password");
    await reauthentifier(ancien);
    await sdk.updatePassword(utilisateur(), nouveau);
  }

  return {
    inscrire,
    connecter,
    renvoyerVerification,
    actualiserVerification,
    reinitialiser,
    reauthentifier,
    ajouterMotDePasse,
    changerMotDePasse,
  };
}

let instance = null;
const outils = () => (instance ??= creerAuthEmail());

export const inscrireEmail = (email, mdp) => outils().inscrire(email, mdp);
export const connecterEmail = (email, mdp) => outils().connecter(email, mdp);
export const renvoyerVerification = () => outils().renvoyerVerification();
export const actualiserVerification = () => outils().actualiserVerification();
export const reinitialiserMotDePasse = (email) => outils().reinitialiser(email);
export const reauthentifierMotDePasse = (mdp) => outils().reauthentifier(mdp);
export const ajouterMotDePasse = (mdp) => outils().ajouterMotDePasse(mdp);
export const changerMotDePasse = (ancien, nouveau) => outils().changerMotDePasse(ancien, nouveau);
