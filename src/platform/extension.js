/** Extension implementation of the platform layer (chrome.*). */
import { lireJson, lirePage } from "./reseau.js";
import { creerServicesStockage } from "./servicesStockage.js";
import {
  creerNonce,
  estGoogleChrome,
  FluxAnnule,
  lireReponse,
  urlAutorisation,
} from "./fluxGoogle.js";

export { lireJson, lirePage };

/** What this platform can do: the interface adapts to it (see docs/plateformes.md). */
export const capacites = {
  nom: "extension",
  lirePagesWeb: true,
  permissionsSites: true,
  barreAdresse: true,
  proposerExtension: false,
  miseAJourManuelle: true,
  installable: false,
};

/** An extension is not added to a home screen. */
export const estInstallee = () => false;

export function getVersion() {
  return chrome.runtime.getManifest().version;
}

// The state, preferences, pending operations, safety copies and the id of the installation
// live in chrome.storage.local, through the code shared with the web app.
const services = creerServicesStockage(
  () => chrome.storage.local,
  () => chrome.storage.onChanged,
);
export const { stockage, preferences, operations, copies, idAppareil } = services;

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

const CLE_BARRE_CHROME = "nedotab:barre-chrome";

/**
 * Chrome always leaves the cursor in its address bar on a new tab page; a tab opened by the
 * extension itself gives it to the page. So a new tab page is replaced at once by a copy
 * opened with chrome.tabs (address "?focus=1", same place, same group), unless the user
 * keeps Chrome's bar on this device. Resolves to true when this page is being replaced
 * (nothing to draw), false otherwise, including when the replacement fails.
 */
export function prendreLeCurseur() {
  const url = new URL(location.href);
  if (url.searchParams.has("focus") || !globalThis.chrome?.tabs?.getCurrent)
    return Promise.resolve(false);
  try {
    if (localStorage.getItem(CLE_BARRE_CHROME) === "1") return Promise.resolve(false);
  } catch {
    /* no setting readable: default behaviour */
  }
  // Only a tab just opened (nothing before it in its history), not a reload, a return with
  // Back, or the page reached from another one in the same tab.
  const navigation = performance.getEntriesByType?.("navigation")[0];
  if ((navigation && navigation.type !== "navigate") || history.length > 1)
    return Promise.resolve(false);
  url.searchParams.set("focus", "1");
  return (async () => {
    try {
      const actuel = await chrome.tabs.getCurrent();
      if (!actuel) return false;
      const copie = await chrome.tabs.create({
        url: url.href,
        index: actuel.index,
        windowId: actuel.windowId,
        active: true,
        ...(actuel.openerTabId ? { openerTabId: actuel.openerTabId } : {}),
      });
      if (actuel.groupId > -1)
        await chrome.tabs.group({ groupId: actuel.groupId, tabIds: copie.id }).catch(() => {});
      await chrome.tabs.remove(actuel.id);
      return true;
    } catch {
      return false;
    }
  })();
}

/** Device-only setting mirrored for the very start of the page (before the state loads). */
export function garderBarreChrome(actif) {
  try {
    if (actif) localStorage.setItem(CLE_BARRE_CHROME, "1");
    else localStorage.removeItem(CLE_BARRE_CHROME);
  } catch {
    /* private mode: the default behaviour stays */
  }
}

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
  const chromeGoogle =
    estGoogleChrome() && typeof chrome.identity?.getAuthToken === "function" && clientOauth();
  if (!chromeGoogle) return jetonParFenetre(interactif);
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

/**
 * Other browsers (Brave, Edge…): a Google window with an OAuth client of type "Web
 * application" (VITE_OAUTH_CLIENT_ID_WEB). Only interactive: there is no cached token.
 */
async function jetonParFenetre(interactif) {
  const clientWeb = import.meta.env.VITE_OAUTH_CLIENT_ID_WEB;
  if (typeof chrome.identity?.launchWebAuthFlow !== "function" || !clientWeb) {
    throw new ConnexionIndisponible("connexion par fenêtre indisponible");
  }
  if (!interactif) throw new ConnexionAnnulee("pas de jeton gardé");
  const nonce = creerNonce();
  let retour;
  try {
    retour = await chrome.identity.launchWebAuthFlow({
      url: urlAutorisation({
        clientId: clientWeb,
        redirection: chrome.identity.getRedirectURL(),
        nonce,
      }),
      interactive: true,
    });
  } catch (e) {
    // Window closed by the user (Chromium reports it as an error).
    throw new ConnexionAnnulee(String(e?.message ?? e));
  }
  if (!retour) throw new ConnexionAnnulee("fenêtre fermée");
  try {
    return lireReponse(retour, nonce);
  } catch (e) {
    if (e instanceof FluxAnnule) throw new ConnexionAnnulee(e.message);
    throw e;
  }
}

export function oublierJetonGoogle(token) {
  if (EMULATEURS) return Promise.resolve();
  return chrome.identity.removeCachedAuthToken({ token });
}
