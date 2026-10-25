/**
 * Web app implementation of the platform layer (V3.0): same functions as extension.js,
 * without any chrome.* API. What the web cannot do returns a neutral value, and the
 * interface reads `capacites` instead of testing the target (see docs/plateformes.md).
 */
import { creerServicesStockage } from "./servicesStockage.js";
import { creerZoneWeb } from "./zoneWeb.js";

/** A phone or a tablet. Safari on iPad says "Macintosh": it is told apart by touch. */
export function estMobile(nav) {
  const ua = nav?.userAgent ?? "";
  return /iphone|ipad|ipod|android/i.test(ua) || (/macintosh/i.test(ua) && nav?.maxTouchPoints > 1);
}

/** What this platform can do: the interface adapts to it. */
export const capacites = {
  nom: "pwa",
  /** Read other sites' pages (titles, icons): no, a web page is bound by CORS. */
  lirePagesWeb: false,
  /** Optional permission to read sites: no such thing on the web. */
  permissionsSites: false,
  /** Take the cursor from the browser's address bar on a new tab: no new tab here. */
  barreAdresse: false,
  /** Suggest the Chrome extension (a computer, not a phone or a tablet). */
  proposerExtension: !estMobile(globalThis.navigator),
  /** Updated by hand from a zip: no, the web app always loads the deployed version. */
  miseAJourManuelle: false,
  /** Can be added to the home screen (V3.1). */
  installable: true,
};

/** Opened from the home screen icon (full screen), not in a browser tab (V3.1). */
export const estInstallee = () =>
  !!globalThis.matchMedia?.("(display-mode: standalone)").matches ||
  globalThis.navigator?.standalone === true;

export function getVersion() {
  return import.meta.env.VITE_VERSION;
}

// The state, preferences, pending operations, safety copies and the id of the installation
// live in IndexedDB; the tabs of the browser tell each other about writes.
let zoneCourante;
const zoneWeb = () => (zoneCourante ??= creerZoneWeb());
const services = creerServicesStockage(
  () => zoneWeb().zone,
  () => zoneWeb().evenements,
);
export const { stockage, preferences, operations, copies, idAppareil } = services;

/** A web page cannot read other sites (CORS): no site permission in the web app. */
export const permissionsSites = {
  disponible: false,
  contient: async () => false,
  demander: async () => false,
  retirer: async () => false,
};

export async function lirePage() {
  return null;
}

export async function lireJson() {
  return null;
}

/** No browser favicon cache on the web: icons come from Google, else a letter badge. */
export function urlFaviconNavigateur() {
  return null;
}

export { fichiers } from "./fichiers.js";

/** No browser address bar to take the cursor from. */
export const prendreLeCurseur = () => Promise.resolve(false);
export function garderBarreChrome() {}

/** No access to the browser's default engine from a web page: Google search. */
export function rechercherSurLeWeb(texte, { nouvelOnglet = false } = {}) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(texte)}`;
  if (nouvelOnglet) window.open(url, "_blank", "noopener");
  else location.assign(url);
}

export class ConnexionIndisponible extends Error {}
export class ConnexionAnnulee extends Error {}

/** Google sign-in of the web app uses a redirect (V3.2): no token here yet. */
export async function obtenirJetonGoogle() {
  throw new ConnexionIndisponible("Connexion de l'application web prévue en V3.2");
}

export async function oublierJetonGoogle() {}
