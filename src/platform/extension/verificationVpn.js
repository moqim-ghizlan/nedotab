/**
 * V5.4: checks that the VPN REALLY works: the address and country the sites see, compared with
 * the server's address and with the normal one. Requests leave the extension like any other
 * request of Chrome, so they go through the proxy when the VPN is on.
 *
 * Everything is kept in chrome.storage.local (never Firebase): the normal IP stays on this
 * computer. No timer lives here: the pages that show the result ask for a light check.
 */
import {
  ajouterHistorique,
  CLE_VERIF,
  diagnostiquer,
  estIp,
  INTERVALLE_AUTO_MS,
  SERVICES,
} from "../../core/diagnosticVpn.js";

const DELAI_MS = 8000;
const ORIGINES = { origins: ["https://*/*", "http://*/*"] };

export function creerVerificationVpn({
  vpn,
  chromeApi = globalThis.chrome,
  fetchFn = (...a) => globalThis.fetch(...a),
  maintenant = Date.now,
} = {}) {
  const stock = () => chromeApi.storage.local;
  let enCours = null;

  async function lire() {
    const b = (await stock().get(CLE_VERIF))[CLE_VERIF] ?? {};
    return {
      normale: b.normale && estIp(b.normale.ip) ? b.normale : null, // { ip, pays, le }
      derniere: b.derniere ?? null, // result summary + `le`
      historique: Array.isArray(b.historique) ? b.historique : [],
    };
  }
  async function ecrire(changements) {
    const b = (await stock().get(CLE_VERIF))[CLE_VERIF] ?? {};
    await stock().set({ [CLE_VERIF]: { ...b, ...changements } });
  }

  async function demander(url, type) {
    const t0 = maintenant();
    const r = await fetchFn(url, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return { valeur: type === "json" ? await r.json() : await r.text(), ms: maintenant() - t0 };
  }

  /** One echo service, then the other if it fails. → { ip, pays, service, ms } or null. */
  async function echo(preferes = SERVICES) {
    for (const service of preferes) {
      try {
        const { valeur, ms } = await demander(
          service.url,
          service.nom === "country.is" ? "json" : "texte",
        );
        const r = service.lire(valeur);
        if (r) return { ...r, service, ms };
      } catch {
        /* next service */
      }
    }
    return null;
  }

  /** Address of the server by DNS-over-HTTPS (through the proxy when it is on). */
  async function ipDuServeur(domaine) {
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domaine)}&type=A`;
      const r = await fetchFn(url, {
        headers: { accept: "application/dns-json" },
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!r.ok) return null;
      const rep = await r.json();
      return (rep.Answer ?? []).map((a) => a.data).find((d) => estIp(d)) ?? null;
    } catch {
      return null;
    }
  }

  async function permise() {
    try {
      return !!(await chromeApi.permissions.contains(ORIGINES));
    } catch {
      return false;
    }
  }

  /** VPN off: remembers the normal address and country (with the date). */
  async function mesurerNormale() {
    if (!(await permise())) return null;
    const r = await echo();
    if (!r) return null;
    const normale = { ip: r.ip, pays: r.pays, le: maintenant() };
    await ecrire({ normale });
    return normale;
  }

  async function executer({ manuel }) {
    const e = await vpn.etat();
    if (!e.actif) {
      if (!e.voulu) await mesurerNormale();
      const d = diagnostiquer({ actif: false, voulu: e.voulu, echo: null });
      return enregistrer(d, { manuel });
    }
    const acces = (await vpn.lire()).acces;
    const premier = await echo();
    const latences = premier ? [premier.ms] : [];
    if (premier) {
      for (let i = 0; i < 2; i += 1) {
        const suite = await echo([premier.service]);
        if (suite) latences.push(suite.ms);
      }
    }
    const apres = await vpn.lire();
    const memo = await lire();
    const d = diagnostiquer({
      actif: true,
      voulu: true,
      echo: premier,
      latences,
      erreurVpn:
        apres.erreur === "serveur" || apres.erreur === "identifiants" ? apres.erreur : null,
      ipServeur: acces?.domaine ? await ipDuServeur(acces.domaine) : null,
      ipNormale: memo.normale?.ip ?? null,
    });
    // Only a real answer says anything about the traffic: a network failure never raises it.
    if (d.global === "fuite") await vpn.signalerTrafic(true);
    else if (d.global === "ok" || d.global === "incertain") await vpn.signalerTrafic(false);
    return enregistrer(d, { manuel });
  }

  async function enregistrer(d, { manuel }) {
    const memo = await lire();
    const resume = {
      le: maintenant(),
      global: d.global,
      message: d.message,
      action: d.action,
      ip: d.ip,
      pays: d.pays,
      latenceMs: d.latenceMs,
      etapes: d.etapes,
    };
    // Automatic checks only add to the history when something changed.
    const change = memo.derniere?.global !== d.global;
    await ecrire({
      derniere: resume,
      historique:
        d.global !== "inactif" && (manuel || change)
          ? ajouterHistorique(memo.historique, {
              le: resume.le,
              global: d.global,
              ip: d.ip,
              pays: d.pays,
              latenceMs: d.latenceMs,
            })
          : memo.historique,
    });
    return resume;
  }

  /** The "Tester" button, the activation: one test at a time. */
  function tester({ manuel = true } = {}) {
    enCours ??= executer({ manuel }).finally(() => {
      enCours = null;
    });
    return enCours;
  }

  /**
   * Called by a page that shows the result, on opening, every 15 minutes and when the network
   * changes. A fresh result is kept as it is.
   */
  async function verifierSiPerime() {
    const { derniere } = await lire();
    if (derniere && maintenant() - derniere.le < INTERVALLE_AUTO_MS) return derniere;
    return tester({ manuel: false });
  }

  return { lire, tester, verifierSiPerime, mesurerNormale };
}
