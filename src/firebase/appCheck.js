import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { envAvecCible } from "./config.js";

/**
 * App Check (V2.2, monitoring mode only — enforcement is decided in the Firebase console).
 * - PWA: reCAPTCHA Enterprise, site key from the environment.
 * - Extension: not enabled. chrome-extension:// pages are not a web domain that reCAPTCHA
 *   can attest; no reliable provider is available for them (see docs/firebase.md).
 * - Development with the emulators: debug token, never in production builds.
 * @returns {boolean} true when App Check was started
 */
export function activerAppCheck(app, env = envAvecCible()) {
  if (env.VITE_TARGET !== "pwa" || !env.VITE_APPCHECK_CLE_RECAPTCHA) return false;
  if (env.DEV && env.VITE_UTILISER_EMULATEURS === "true") {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_CLE_RECAPTCHA),
    isTokenAutoRefreshEnabled: true,
  });
  return true;
}
