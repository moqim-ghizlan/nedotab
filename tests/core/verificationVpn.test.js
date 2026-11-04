import { describe, expect, it, vi } from "vitest";
import { creerVerificationVpn } from "../../src/platform/extension/verificationVpn.js";
import { CLE_VERIF } from "../../src/core/diagnosticVpn.js";

function monde({ actif = true, erreur = null, reponses = {}, permis = true } = {}) {
  const donnees = {};
  const chromeApi = {
    storage: {
      local: {
        get: async (k) => ({ [k]: donnees[k] }),
        set: async (o) => Object.assign(donnees, o),
      },
    },
    permissions: { contains: async () => permis },
  };
  const vpn = {
    etat: async () => ({ actif, voulu: actif }),
    lire: async () => ({ acces: { domaine: "vpn.exemple.org" }, erreur }),
    signalerTrafic: vi.fn(async () => {}),
  };
  const fetchFn = vi.fn(async (url) => {
    const rep = Object.entries(reponses).find(([cle]) => url.includes(cle))?.[1];
    if (!rep) throw new TypeError("réseau");
    return { ok: true, text: async () => rep, json: async () => JSON.parse(rep) };
  });
  return { chromeApi, donnees, vpn, fetchFn };
}
const TRACE = (ip) => `ip=${ip}\nloc=FR\n`;
const DNS = JSON.stringify({ Answer: [{ data: "1.2.3.4" }] });

describe("vérification du VPN", () => {
  it("actif et IP du serveur : ok, résultat gardé localement, pas d'alerte", async () => {
    const m = monde({ reponses: { "cdn-cgi/trace": TRACE("1.2.3.4"), "dns-query": DNS } });
    const v = creerVerificationVpn({ ...m, maintenant: () => 5 });
    const r = await v.tester();
    expect(r.global).toBe("ok");
    expect(m.vpn.signalerTrafic).toHaveBeenCalledWith(false);
    expect(m.donnees[CLE_VERIF].historique).toHaveLength(1);
  });
  it("l'IP vue est l'IP normale : alerte sur le badge", async () => {
    const m = monde({ reponses: { "cdn-cgi/trace": TRACE("9.9.9.9"), "dns-query": DNS } });
    m.donnees[CLE_VERIF] = { normale: { ip: "9.9.9.9", pays: "FR", le: 1 } };
    const r = await creerVerificationVpn(m).tester();
    expect(r.global).toBe("fuite");
    expect(m.vpn.signalerTrafic).toHaveBeenCalledWith(true);
  });
  it("repli sur le second service quand le premier est bloqué", async () => {
    const m = monde({
      reponses: { "api.country.is": '{"ip":"1.2.3.4","country":"FR"}', "dns-query": DNS },
    });
    const r = await creerVerificationVpn(m).tester();
    expect(r.global).toBe("ok");
  });
  it("réseau coupé : échec, mais jamais d'alerte « hors VPN »", async () => {
    const m = monde({ reponses: {} });
    const r = await creerVerificationVpn(m).tester();
    expect(r.global).toBe("echec");
    expect(m.vpn.signalerTrafic).not.toHaveBeenCalled();
  });
  it("VPN éteint : mesure et mémorise l'IP normale avec la date", async () => {
    const m = monde({ actif: false, reponses: { "cdn-cgi/trace": TRACE("9.9.9.9") } });
    const v = creerVerificationVpn({ ...m, maintenant: () => 42 });
    await v.tester();
    expect((await v.lire()).normale).toEqual({ ip: "9.9.9.9", pays: "FR", le: 42 });
  });
  it("sans accès aux sites : rien n'est mesuré à l'arrêt", async () => {
    const m = monde({
      actif: false,
      permis: false,
      reponses: { "cdn-cgi/trace": TRACE("9.9.9.9") },
    });
    await creerVerificationVpn(m).tester();
    expect(m.fetchFn).not.toHaveBeenCalled();
  });
  it("un résultat récent n'est pas refait par la vérification légère", async () => {
    const m = monde({ reponses: { "cdn-cgi/trace": TRACE("1.2.3.4"), "dns-query": DNS } });
    const v = creerVerificationVpn({ ...m, maintenant: () => 1000 });
    await v.tester();
    const n = m.fetchFn.mock.calls.length;
    await v.verifierSiPerime();
    expect(m.fetchFn.mock.calls.length).toBe(n);
  });
});
