/**
 * Firebase web configuration, read from the environment (.env.local, see .env.example).
 * It is not secret (security relies on the rules and App Check) but stays out of the
 * repository so that a test and a production project can be swapped.
 */
const CHAMPS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
};

/** Local project of the emulators: "demo-" projects never reach a real Firebase project. */
export const PROJET_DEMO = "demo-nedotab";

/**
 * import.meta.env plus the target: VITE_TARGET is replaced in the code at build time
 * (vite.config.js `define`) but is not a key of the import.meta.env object.
 */
export const envAvecCible = () => ({
  ...import.meta.env,
  VITE_TARGET: import.meta.env.VITE_TARGET,
});

const vrai = (v) => v === true || v === "true";

/**
 * @returns {{ config: object, emulateurs: boolean }}
 * @throws {Error} readable message naming the missing variables
 */
export function lireConfig(env = envAvecCible()) {
  const emulateurs = vrai(env.VITE_UTILISER_EMULATEURS);
  // The emulators always use the local demo project, even when .env.local holds a real one:
  // a test run can never reach real data.
  if (emulateurs) {
    return {
      emulateurs,
      config: {
        apiKey: "demo-cle",
        authDomain: `${PROJET_DEMO}.firebaseapp.com`,
        projectId: PROJET_DEMO,
        storageBucket: `${PROJET_DEMO}.appspot.com`,
        messagingSenderId: "0",
        appId: "demo-app",
      },
    };
  }
  const manquants = Object.values(CHAMPS).filter((cle) => !env[cle]);
  if (manquants.length) {
    throw new Error(
      `Configuration Firebase incomplète : ${manquants.join(", ")} manquante(s). ` +
        "Copiez .env.example en .env.local et remplissez-le.",
    );
  }
  const config = Object.fromEntries(
    Object.entries(CHAMPS).map(([champ, cle]) => [champ, env[cle]]),
  );
  // V3.2: the web app signs in on its own domain (the Hosting one), otherwise Safari blocks
  // the third-party cookies of the redirect and the user comes back signed out.
  if (env.VITE_TARGET === "pwa")
    config.authDomain = env.VITE_FIREBASE_AUTH_DOMAIN_PWA || `${config.projectId}.web.app`;
  return { emulateurs, config };
}
