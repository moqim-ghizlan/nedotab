/**
 * Google sign-in through a standard OAuth window (chrome.identity.launchWebAuthFlow), for
 * browsers without Chrome's built-in Google account (Brave, Edge, Opera…). Pure helpers:
 * the window itself is opened by the platform layer.
 *
 * Flow: implicit OAuth 2.0 / OpenID Connect with an OAuth client of type "Web application"
 * whose redirect URI is https://<extension id>.chromiumapp.org/. Only an ID token is asked
 * (scopes openid, email, profile); its nonce is checked before it is handed to Firebase.
 */
export const URL_AUTORISATION = "https://accounts.google.com/o/oauth2/v2/auth";

/** The user closed or refused the window. */
export class FluxAnnule extends Error {}

/**
 * True in Google Chrome, where chrome.identity.getAuthToken works with the browser's
 * Google account. Other Chromium browsers expose the function but cannot complete it.
 */
export function estGoogleChrome(nav = globalThis.navigator) {
  if (nav?.brave) return false;
  const marques = nav?.userAgentData?.brands;
  if (Array.isArray(marques)) return marques.some((m) => m.brand === "Google Chrome");
  return /Chrome\//.test(nav?.userAgent ?? "") && !/Edg\/|OPR\//.test(nav?.userAgent ?? "");
}

/** Random value tying the answer to this request (replay protection). */
export function creerNonce(octets = globalThis.crypto.getRandomValues(new Uint8Array(16))) {
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

export function urlAutorisation({ clientId, redirection, nonce, choisirCompte = true }) {
  const url = new URL(URL_AUTORISATION);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirection);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("nonce", nonce);
  if (choisirCompte) url.searchParams.set("prompt", "select_account");
  return url.href;
}

/** Payload of a JWT (base64url), without checking its signature (Firebase does). */
function charge(jwt) {
  const partie = String(jwt).split(".")[1];
  if (!partie) throw new Error("Jeton Google illisible");
  const base64 = partie.replace(/-/g, "+").replace(/_/g, "/");
  const binaire = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binaire, (c) => c.charCodeAt(0))));
}

/**
 * Reads the redirect URL returned by the window.
 * @returns {{ idToken: string }}
 * @throws {FluxAnnule} refused or closed; Error for anything unexpected
 */
export function lireReponse(urlRetour, nonceAttendu) {
  const fragment = new URLSearchParams(new URL(urlRetour).hash.slice(1));
  const erreur = fragment.get("error");
  if (erreur) {
    if (/access_denied|user_cancelled|interaction_required/.test(erreur)) {
      throw new FluxAnnule(erreur);
    }
    throw new Error(`Connexion Google refusée : ${erreur}`);
  }
  const idToken = fragment.get("id_token");
  if (!idToken) throw new Error("Aucun jeton dans la réponse de Google");
  if (charge(idToken).nonce !== nonceAttendu) throw new Error("Réponse de Google inattendue");
  return { idToken };
}
