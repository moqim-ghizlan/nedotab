/**
 * V5.3: the browser VPN of the extension (chrome.proxy). The wanted state ("actif") and the
 * identifiers live in chrome.storage.local; the interface always shows the REAL state read from
 * chrome.proxy.settings. A network failure never disables the VPN (no silent direct connection):
 * only refused identifiers do. The proxy identifiers are given to the project's proxy only.
 */
import {
  CLE_VPN,
  configProxy,
  estPanneServeur,
  estDemandeDuProxy,
  estReellementActif,
  MESSAGES,
  POLITIQUE_WEBRTC,
  raisonNonControlable,
  reglageControlable,
  suivreDemande,
} from "../../core/vpnProxy.js";
import { lireAcces } from "../../core/vpn.js";

const EXPIRATION_ERREUR_MS = 60_000;
const ORIGINES = { origins: ["https://*/*", "http://*/*"] };

export function creerVpn({ chromeApi = globalThis.chrome, maintenant = Date.now } = {}) {
  const stock = () => chromeApi.storage.local;
  const repondus = new Set(); // ids of the requests already answered
  let suiviErreurs = null;
  let derniereVerif = 0;

  async function lire() {
    const brut = (await stock().get(CLE_VPN))[CLE_VPN] ?? {};
    return {
      actif: brut.actif === true,
      incognito: brut.incognito === true,
      erreur: typeof brut.erreur === "string" ? brut.erreur : null,
      erreurLe: Number(brut.erreurLe) || 0,
      acces: lireAcces(brut.acces),
    };
  }
  async function ecrire(changements) {
    const brut = (await stock().get(CLE_VPN))[CLE_VPN] ?? {};
    await stock().set({ [CLE_VPN]: { ...brut, ...changements } });
  }

  async function badge(texte, couleur) {
    try {
      await chromeApi.action.setBadgeText({ text: texte });
      if (couleur) await chromeApi.action.setBadgeBackgroundColor({ color: couleur });
    } catch {
      /* no action available (tests): the state is still right */
    }
  }
  const afficherBadge = (e) =>
    e.erreur ? badge("!", "#c62828") : e.actif ? badge("ON", "#2e7d32") : badge("");

  async function reel(acces) {
    const r = await chromeApi.proxy.settings.get({ incognito: false });
    return estReellementActif(r, acces);
  }

  /**
   * V5.5: WebRTC without UDP outside the proxy, and no network prediction (it could resolve
   * names locally). Only what this extension may set is touched, and it is given back by
   * `rendreProtections`. Returns what is really protected.
   */
  async function poserProtections() {
    const res = { webrtc: false, prediction: false };
    const r = chromeApi.privacy?.network;
    if (!r) return res;
    try {
      const w = await r.webRTCIPHandlingPolicy.get({});
      if (reglageControlable(w.levelOfControl)) {
        await r.webRTCIPHandlingPolicy.set({ value: POLITIQUE_WEBRTC });
        res.webrtc = true;
      }
      const n = await r.networkPredictionEnabled.get({});
      if (reglageControlable(n.levelOfControl)) {
        await r.networkPredictionEnabled.set({ value: false });
        res.prediction = true;
      }
    } catch {
      /* unavailable: shown as "not protected" */
    }
    await ecrire({ protections: res });
    return res;
  }

  async function rendreProtections() {
    const r = chromeApi.privacy?.network;
    try {
      await r?.webRTCIPHandlingPolicy.clear({});
      await r?.networkPredictionEnabled.clear({});
    } catch {
      /* nothing to give back */
    }
  }

  /** Everything the interface shows, in one read. */
  async function etat() {
    let e = await lire();
    // A server error fades by itself when no new one comes (the server answers again).
    if (e.erreur === "serveur" && maintenant() - e.erreurLe > EXPIRATION_ERREUR_MS) {
      await effacerErreur();
      e = await lire();
    }
    return {
      actif: e.actif && (await reel(e.acces)),
      voulu: e.actif,
      incognito: e.incognito,
      erreur: e.erreur,
      messageErreur: e.erreur ? (MESSAGES[e.erreur] ?? null) : null,
      aAcces: !!e.acces,
      domaine: e.acces?.domaine ?? null,
      pays: e.acces?.pays ?? null,
      protections: (await stock().get(CLE_VPN))[CLE_VPN]?.protections ?? null,
    };
  }

  async function incognitoAutorise() {
    try {
      return !!(await chromeApi.extension.isAllowedIncognitoAccess());
    } catch {
      return false;
    }
  }

  /**
   * Host permission asked in the click (first activation): the project's proxy asks for its
   * password through webRequest, which only sees addresses the extension may access.
   */
  async function permissionOk(demander) {
    if (await chromeApi.permissions.contains(ORIGINES)) return true;
    return demander ? !!(await chromeApi.permissions.request(ORIGINES)) : false;
  }

  /** @returns {Promise<{ok: true} | {ok: false, raison: string}>} */
  async function activer({ incognito, demanderPermission = true } = {}) {
    const e = await lire();
    if (!e.acces) return { ok: false, raison: MESSAGES.pasAcces };
    if (!(await permissionOk(demanderPermission)))
      return { ok: false, raison: MESSAGES.permission };
    const regles = await chromeApi.proxy.settings.get({ incognito: false });
    // Already ours: fine. Another extension or a policy: never forced.
    const bloque = raisonNonControlable(regles.levelOfControl);
    if (bloque) return { ok: false, raison: bloque };
    const avecIncognito = incognito ?? e.incognito;
    if (avecIncognito && !(await incognitoAutorise()))
      return { ok: false, raison: MESSAGES.incognito };
    const value = configProxy(e.acces);
    await chromeApi.proxy.settings.set({ value, scope: "regular" });
    if (avecIncognito) await chromeApi.proxy.settings.set({ value, scope: "incognito_persistent" });
    else await chromeApi.proxy.settings.clear({ scope: "incognito_persistent" }).catch(() => {});
    repondus.clear();
    await poserProtections();
    await ecrire({ actif: true, incognito: avecIncognito, erreur: null });
    await afficherBadge({ actif: true, erreur: null });
    return { ok: true };
  }

  async function desactiver({ erreur = null } = {}) {
    await chromeApi.proxy.settings.clear({ scope: "regular" });
    await chromeApi.proxy.settings.clear({ scope: "incognito_persistent" }).catch(() => {});
    repondus.clear();
    await rendreProtections();
    await ecrire({ actif: false, erreur, protections: null });
    await afficherBadge({ actif: false, erreur });
  }

  /** Keeps the identifiers received from the server (local only). */
  async function memoriserAcces(acces) {
    const a = lireAcces(acces);
    if (!a) return false;
    await ecrire({ acces: a, erreur: null });
    return true;
  }

  /** Sign-out, account deletion, "forget": proxy off and identifiers erased from this computer. */
  async function oublier() {
    await chromeApi.proxy.settings.clear({ scope: "regular" }).catch(() => {});
    await chromeApi.proxy.settings.clear({ scope: "incognito_persistent" }).catch(() => {});
    repondus.clear();
    await rendreProtections();
    await stock().remove(CLE_VPN);
    await badge("");
  }

  /** Proxy error (server down): red badge and a message; the VPN stays on, the user decides. */
  async function signalerErreurServeur(details) {
    const e = await lire();
    if (!e.actif || !estPanneServeur(details)) return;
    // One failing connection (an unreachable site) is not a server outage: several in a row are.
    const s = suivreDemande(suiviErreurs, maintenant());
    suiviErreurs = s.etat;
    if (!s.refuse && e.erreur !== "serveur") return;
    await ecrire({ erreur: "serveur", erreurLe: maintenant() });
    await afficherBadge({ ...e, erreur: "serveur" });
  }

  async function effacerErreur() {
    await ecrire({ erreur: null });
    await afficherBadge({ ...(await lire()), erreur: null });
  }

  /**
   * V5.4: the check found (or no longer finds) that the sites do not see the server's address.
   * Red "!" and a message until a later check says otherwise.
   */
  async function signalerTrafic(probleme) {
    const e = await lire();
    if (!e.actif) return;
    if (probleme && e.erreur !== "trafic") {
      await ecrire({ erreur: "trafic", erreurLe: maintenant() });
      await afficherBadge({ ...e, erreur: "trafic" });
    } else if (!probleme && e.erreur === "trafic") await effacerErreur();
  }

  /**
   * webRequest.onCompleted listener: a page came back through the proxy, so the server answers
   * again. The red "!" goes away by itself (checked at most every 3 s, it is cheap).
   */
  async function surRequeteReussie(details) {
    if (details?.fromCache || !(details?.statusCode > 0)) return;
    const t = maintenant();
    if (t - derniereVerif < 3000) return;
    derniereVerif = t;
    const e = await lire();
    if (e.actif && e.erreur === "serveur") await effacerErreur();
  }

  /** Service worker start: the wanted state is applied again if Chrome lost it. */
  async function reappliquer() {
    const e = await lire();
    if (!e.actif) return afficherBadge(e);
    if (await reel(e.acces)) {
      await poserProtections();
      return afficherBadge(e);
    }
    await activer({ demanderPermission: false });
  }

  /**
   * webRequest.onAuthRequired listener (registered at the top level of the worker). Answers
   * the project's proxy only; a request that asks twice has had its identifiers refused.
   */
  function surAuth(details, rappel) {
    (async () => {
      const e = await lire();
      if (!estDemandeDuProxy(details, e.acces)) return rappel({});
      // Many connections may ask at once (a fresh private window has no saved password): that is
      // normal. Identifiers are refused only when the SAME request asks again after our answer.
      const id = details.requestId;
      const refuse = id !== undefined && repondus.has(id);
      if (id !== undefined) {
        if (repondus.size >= 500) repondus.delete(repondus.values().next().value);
        repondus.add(id);
      }
      if (refuse) {
        rappel({ cancel: true });
        await desactiver({ erreur: "identifiants" });
        return;
      }
      rappel({ authCredentials: { username: e.acces.compte, password: e.acces.motDePasse } });
    })().catch(() => rappel({}));
  }

  /** To call in the click: the host permission for the first activation. */
  const permission = () => permissionOk(true);

  /** Remembers the "private browsing" choice while the VPN is off. */
  async function definirIncognito(valeur) {
    await ecrire({ incognito: !!valeur });
  }

  return {
    permission,
    definirIncognito,
    lire,
    etat,
    activer,
    desactiver,
    memoriserAcces,
    oublier,
    signalerErreurServeur,
    signalerTrafic,
    effacerErreur,
    reappliquer,
    surAuth,
    surRequeteReussie,
  };
}
