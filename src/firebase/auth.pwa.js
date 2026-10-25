import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithRedirect,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { obtenirApp } from "./app.js";

/**
 * Google sign-in for the web app (V3.2): a full-page redirect to Google and back, the only
 * flow that works in the app installed on the iPhone home screen (pop-ups are unreliable
 * there). Same functions as auth.extension.js: the interface does not know which one runs.
 * The session is kept in IndexedDB.
 */
let auth = null;

/** Below this age a sign-in still confirms the account deletion (server: 300 s). */
const CONFIRMATION_MAX_MS = 4 * 60 * 1000;

export function obtenirAuth() {
  if (auth) return auth;
  const { app, emulateurs } = obtenirApp();
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
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

function fournisseur() {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" }); // lets the user pick the account
  return google;
}

/** Leaves the page for Google: the result is read by terminerConnexion() on the way back. */
export async function connecter() {
  await signInWithRedirect(obtenirAuth(), fournisseur());
}

/**
 * At startup, after a redirect: the signed-in profile, or null when the user came back
 * without signing in.
 */
export async function terminerConnexion() {
  const resultat = await getRedirectResult(obtenirAuth());
  return profil(resultat?.user);
}

/**
 * Confirms the account deletion (V2.10): a sign-in of less than a few minutes is enough,
 * otherwise Google is asked again (redirect, finished by terminerConnexion()).
 * @returns {Promise<object>} the profile, only when no redirect was needed
 */
export async function reconnecterPourConfirmer() {
  const utilisateur = obtenirAuth().currentUser;
  if (!utilisateur) throw new Error("Aucun utilisateur connecté");
  const { authTime } = await utilisateur.getIdTokenResult();
  if (Date.now() - Date.parse(authTime) < CONFIRMATION_MAX_MS) return profil(utilisateur);
  await reauthenticateWithRedirect(utilisateur, fournisseur());
  return new Promise(() => {}); // the page is leaving
}

export async function deconnecter() {
  await signOut(obtenirAuth());
}

/** Calls `callback(profil|null)` on every sign-in state change; returns the unsubscribe. */
export function ecouterUtilisateur(callback) {
  return onAuthStateChanged(obtenirAuth(), (u) => callback(profil(u)));
}
