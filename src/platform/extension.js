/** Extension implementation of the platform layer (chrome.*). */
import { lireJson, lirePage } from "./reseau.js";
import { creerStockage } from "./stockageChrome.js";
import {
  creerNonce,
  estGoogleChrome,
  FluxAnnule,
  lireReponse,
  urlAutorisation,
} from "./fluxGoogle.js";

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

const PREFIXE_OPERATIONS = "operationsEnAttente:";

/**
 * Pending sync operations (V2.9), one queue per open tab: two tabs never overwrite each
 * other's queue. They survive closing the browser.
 */
export const operations = {
  async ecrire(idOnglet, valeur) {
    await chrome.storage.local.set({ [PREFIXE_OPERATIONS + idOnglet]: valeur });
  },
  async supprimer(idOnglet) {
    await chrome.storage.local.remove(PREFIXE_OPERATIONS + idOnglet);
  },
  async toutes() {
    const tout = await chrome.storage.local.get(null);
    return Object.fromEntries(
      Object.entries(tout)
        .filter(([cle]) => cle.startsWith(PREFIXE_OPERATIONS))
        .map(([cle, v]) => [cle.slice(PREFIXE_OPERATIONS.length), v]),
    );
  },
  /** callback(idOnglet, valeur | null) when another tab changes its queue. */
  surChangement(callback) {
    const ecouteur = (changements, zone) => {
      if (zone !== "local") return;
      for (const [cle, { newValue }] of Object.entries(changements)) {
        if (cle.startsWith(PREFIXE_OPERATIONS))
          callback(cle.slice(PREFIXE_OPERATIONS.length), newValue ?? null);
      }
    };
    chrome.storage.onChanged.addListener(ecouteur);
    return () => chrome.storage.onChanged.removeListener(ecouteur);
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
  // Only a page just opened, not a reload or a return with Back.
  const navigation = performance.getEntriesByType?.("navigation")[0];
  if (navigation && navigation.type !== "navigate") return Promise.resolve(false);
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

const PREFIXE_COPIE = "copieAvantSynchro:";

/**
 * Safety copies of the local state, written before any synchronisation step
 * (the 3 most recent are kept). Returned newest first: [{ cle, date, etat }].
 */
export const copies = {
  /** Every safety copy of this computer (account deletion, V2.10). */
  async effacerTout() {
    await chrome.storage.local.remove((await copies.lister()).map((c) => c.cle));
  },
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
