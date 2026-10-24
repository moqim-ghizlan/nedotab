/** Extension implementation of the platform layer (chrome.*). */
import { lireJson, lirePage } from "./reseau.js";
import { creerStockage } from "./stockageChrome.js";

export { lireJson, lirePage };

export function getVersion() {
  return chrome.runtime.getManifest().version;
}

let stockageCourant;
export function stockage() {
  stockageCourant ??= creerStockage(chrome.storage.local, chrome.storage.onChanged);
  return stockageCourant;
}

/** Small per-device preferences, outside the synced state. */
export const preferences = {
  async lire(cle) {
    const r = await chrome.storage.local.get(`pref:${cle}`);
    return r[`pref:${cle}`];
  },
  async ecrire(cle, valeur) {
    await chrome.storage.local.set({ [`pref:${cle}`]: valeur });
  },
};

const ORIGINES_SITES = { origins: ["https://*/*", "http://*/*"] };

export const permissionsSites = {
  disponible: true,
  contient: () => chrome.permissions.contains(ORIGINES_SITES),
  /** Must be called synchronously from a click handler (user gesture). */
  demander: () => chrome.permissions.request(ORIGINES_SITES),
  retirer: () => chrome.permissions.remove(ORIGINES_SITES),
};

/** Chrome's own favicon cache (needs the "favicon" permission). */
export function urlFaviconNavigateur(pageUrl, taille = 64) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(taille));
  return url.href;
}

export { fichiers } from "./fichiers.js";

/** Web search with the user's default engine (never changes it). */
export function rechercherSurLeWeb(texte, { nouvelOnglet = false } = {}) {
  return chrome.search.query({
    text: texte,
    disposition: nouvelOnglet ? "NEW_TAB" : "CURRENT_TAB",
  });
}

/** Error raised when the browser has no Google sign-in through chrome.identity. */
export class ConnexionIndisponible extends Error {}
/** The user closed or refused the sign-in window: not an error to show. */
export class ConnexionAnnulee extends Error {}

const EMULATEURS = import.meta.env.VITE_UTILISER_EMULATEURS === "true";
const clientOauth = () => globalThis.chrome?.runtime?.getManifest?.().oauth2?.client_id;

/**
 * Google token for Firebase. With the emulators, a test identity is used (the Auth
 * emulator accepts unsigned Google ID tokens): no real Google account is involved.
 * @returns {Promise<{ accessToken?: string, idToken?: string }>}
 */
export async function obtenirJetonGoogle(interactif) {
  if (EMULATEURS) {
    const email = (await preferences.lire("emulateurCompte")) ?? "testeur@nedotab.test";
    const idToken = JSON.stringify({
      sub: `google-${email}`,
      email,
      email_verified: true,
      name: "Testeur NedoTab",
    });
    return { idToken };
  }
  if (typeof chrome.identity?.getAuthToken !== "function" || !clientOauth()) {
    throw new ConnexionIndisponible("chrome.identity indisponible");
  }
  try {
    const r = await chrome.identity.getAuthToken({ interactive: interactif });
    const token = typeof r === "string" ? r : r?.token;
    if (!token) throw new ConnexionAnnulee("aucun jeton");
    return { accessToken: token };
  } catch (e) {
    const message = String(e?.message ?? e);
    if (/not approve|did not approve|cancel|closed|not granted|revoked|user/i.test(message)) {
      throw new ConnexionAnnulee(message);
    }
    if (/not supported|unsupported|not available/i.test(message)) {
      throw new ConnexionIndisponible(message);
    }
    throw e;
  }
}

export function oublierJetonGoogle(token) {
  if (EMULATEURS) return Promise.resolve();
  return chrome.identity.removeCachedAuthToken({ token });
}

const PREFIXE_COPIE = "copieAvantSynchro:";

/**
 * Safety copies of the local state, written before any synchronisation step
 * (the 3 most recent are kept). Returned newest first: [{ cle, date, etat }].
 */
export const copies = {
  async enregistrer(etat) {
    const cle = `${PREFIXE_COPIE}${new Date().toISOString()}`;
    await chrome.storage.local.set({ [cle]: etat });
    const toutes = (await copies.lister()).map((c) => c.cle);
    const anciennes = toutes.slice(3);
    if (anciennes.length) await chrome.storage.local.remove(anciennes);
    return cle;
  },
  async lister() {
    const tout = await chrome.storage.local.get(null);
    return Object.keys(tout)
      .filter((k) => k.startsWith(PREFIXE_COPIE))
      .sort()
      .reverse()
      .map((cle) => ({ cle, date: Date.parse(cle.slice(PREFIXE_COPIE.length)), etat: tout[cle] }));
  },
};

/** Persistent id of this installation (not of the tab): who wrote the account's data. */
export async function idAppareil() {
  let id = await preferences.lire("idAppareil");
  if (!id) {
    id = globalThis.crypto.randomUUID();
    await preferences.ecrire("idAppareil", id);
  }
  return id;
}
