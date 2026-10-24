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
};

/** Chrome's own favicon cache (needs the "favicon" permission). */
export function urlFaviconNavigateur(pageUrl, taille = 64) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(taille));
  return url.href;
}
