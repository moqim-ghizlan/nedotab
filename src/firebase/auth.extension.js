import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
} from "firebase/auth/web-extension";
import { obtenirApp } from "./app.js";

/**
 * Google sign-in for the extension: Chrome provides the Google token (platform layer,
 * chrome.identity), Firebase turns it into a session (persisted in IndexedDB).
 * This module never touches `chrome`: the token functions are passed in.
 */
let auth = null;

export function obtenirAuth() {
  if (auth) return auth;
  const { app, emulateurs } = obtenirApp();
  auth = getAuth(app);
  if (emulateurs) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  return auth;
}

/** Public profile kept by the interface (no token, ever). */
export function profil(utilisateur) {
  if (!utilisateur) return null;
  return {
    uid: utilisateur.uid,
    nom: utilisateur.displayName ?? "",
    email: utilisateur.email ?? "",
    photo: utilisateur.photoURL ?? "",
  };
}

/**
 * @param {{ obtenirJeton: (interactif: boolean) => Promise<{ accessToken?: string, idToken?: string }> }} plateforme
 */
export async function connecter({ obtenirJeton }) {
  const { accessToken, idToken } = await obtenirJeton(true);
  const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? null);
  const resultat = await signInWithCredential(obtenirAuth(), credential);
  return profil(resultat.user);
}

export async function deconnecter({ obtenirJeton, oublierJeton }) {
  try {
    const jeton = await obtenirJeton(false);
    if (jeton?.accessToken) await oublierJeton(jeton.accessToken);
  } catch {
    /* no cached token: nothing to forget */
  }
  await signOut(obtenirAuth());
}

/** The extension never leaves the page to sign in: no redirect to finish (V3.2). */
export async function terminerConnexion() {
  return null;
}

/** A fresh Google sign-in confirms the account deletion (V2.10). */
export const reconnecterPourConfirmer = connecter;

/** Calls `callback(profil|null)` on every sign-in state change; returns the unsubscribe. */
export function ecouterUtilisateur(callback) {
  return onAuthStateChanged(obtenirAuth(), (u) => callback(profil(u)));
}
