import { describe, expect, it, vi } from "vitest";
import { creerVpn } from "../../src/platform/extension/vpn.js";
import { CLE_VPN, MESSAGES } from "../../src/core/vpnProxy.js";

const ACCES = {
  domaine: "vpn.exemple.org",
  port: 443,
  compte: "u_x",
  motDePasse: "mdp",
  pays: "France",
};
const LIBRE = "controllable_by_this_extension";

function fauxChrome({ niveau = LIBRE, permis = true, stock = {} } = {}) {
  const donnees = { ...stock };
  let reglage = { levelOfControl: niveau, value: { mode: "system" } };
  const chromeApi = {
    storage: {
      local: {
        get: async (k) => ({ [k]: donnees[k] }),
        set: async (o) => Object.assign(donnees, o),
        remove: async (k) => delete donnees[k],
      },
    },
    proxy: {
      settings: {
        get: vi.fn(async () => reglage),
        set: vi.fn(async ({ value, scope }) => {
          if (scope === "regular")
            reglage = { levelOfControl: "controlled_by_this_extension", value };
        }),
        clear: vi.fn(async ({ scope }) => {
          if (scope === "regular") reglage = { levelOfControl: LIBRE, value: { mode: "system" } };
        }),
      },
    },
    permissions: { contains: vi.fn(async () => permis), request: vi.fn(async () => permis) },
    extension: { isAllowedIncognitoAccess: vi.fn(async () => false) },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
  };
  return { chromeApi, donnees };
}
const avecAcces = { [CLE_VPN]: { acces: ACCES } };

describe("activer / désactiver", () => {
  it("active : configuration du proxy, état voulu, badge ON", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    expect(await vpn.activer()).toEqual({ ok: true });
    expect(chromeApi.proxy.settings.set).toHaveBeenCalledWith({
      value: {
        mode: "fixed_servers",
        rules: {
          singleProxy: { scheme: "https", host: "vpn.exemple.org", port: 443 },
          bypassList: ["<local>"],
        },
      },
      scope: "regular",
    });
    expect((await vpn.etat()).actif).toBe(true);
    expect(chromeApi.action.setBadgeText).toHaveBeenLastCalledWith({ text: "ON" });
  });
  it("désactive : clear et badge vide", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    await vpn.activer();
    await vpn.desactiver();
    expect(chromeApi.proxy.settings.clear).toHaveBeenCalledWith({ scope: "regular" });
    expect((await vpn.etat()).actif).toBe(false);
    expect(chromeApi.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" });
  });
  it.each([
    ["controlled_by_other_extensions", MESSAGES.autreExtension],
    ["not_controllable", MESSAGES.politique],
  ])("%s : aucun appel à set, message clair", async (niveau, raison) => {
    const { chromeApi } = fauxChrome({ niveau, stock: avecAcces });
    const r = await creerVpn({ chromeApi }).activer();
    expect(r).toEqual({ ok: false, raison });
    expect(chromeApi.proxy.settings.set).not.toHaveBeenCalled();
  });
  it("permission refusée : le VPN ne s'active pas", async () => {
    const { chromeApi } = fauxChrome({ permis: false, stock: avecAcces });
    const r = await creerVpn({ chromeApi }).activer();
    expect(r).toEqual({ ok: false, raison: MESSAGES.permission });
    expect(chromeApi.proxy.settings.set).not.toHaveBeenCalled();
  });
  it("sans accès local : message, rien n'est réglé", async () => {
    const { chromeApi } = fauxChrome();
    expect((await creerVpn({ chromeApi }).activer()).raison).toBe(MESSAGES.pasAcces);
  });
  it("navigation privée refusée si l'extension n'y est pas autorisée", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const r = await creerVpn({ chromeApi }).activer({ incognito: true });
    expect(r.raison).toBe(MESSAGES.incognito);
    expect(chromeApi.proxy.settings.set).not.toHaveBeenCalled();
  });
  it("navigation privée autorisée : scope incognito_persistent", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    chromeApi.extension.isAllowedIncognitoAccess.mockResolvedValue(true);
    await creerVpn({ chromeApi }).activer({ incognito: true });
    expect(chromeApi.proxy.settings.set).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "incognito_persistent" }),
    );
  });
});

describe("authentification du proxy", () => {
  const demande = {
    isProxy: true,
    requestId: "1",
    challenger: { host: "vpn.exemple.org", port: 443 },
  };
  const appeler = (vpn, details) => new Promise((res) => vpn.surAuth(details, res));

  it("fournit les identifiants au proxy du projet seulement", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    expect(await appeler(vpn, demande)).toEqual({
      authCredentials: { username: "u_x", password: "mdp" },
    });
    const autreHote = { ...demande, challenger: { host: "autre.org", port: 443 } };
    expect(await appeler(vpn, autreHote)).toEqual({});
    expect(await appeler(vpn, { ...demande, isProxy: false })).toEqual({});
  });
  it("beaucoup de connexions simultanées (fenêtre privée neuve) : toutes reçoivent la réponse", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    await vpn.activer();
    for (let i = 0; i < 20; i++) {
      const r = await appeler(vpn, { ...demande, requestId: String(100 + i) });
      expect(r.authCredentials).toBeDefined();
    }
    expect((await vpn.etat()).erreur).toBeNull();
  });
  it("la même requête qui redemande après notre réponse : annule et désactive", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    await vpn.activer();
    expect((await appeler(vpn, demande)).authCredentials).toBeDefined();
    expect(await appeler(vpn, demande)).toEqual({ cancel: true });
    await vi.waitFor(async () => expect((await vpn.etat()).erreur).toBe("identifiants"));
    expect((await vpn.etat()).voulu).toBe(false);
    expect(chromeApi.proxy.settings.clear).toHaveBeenCalledWith({ scope: "regular" });
  });
});

describe("pannes et démarrage", () => {
  it("une erreur du proxy affiche « ! » mais ne désactive pas le VPN", async () => {
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    await vpn.activer();
    // One isolated error is not an outage; non-fatal ones are ignored.
    const panne = { fatal: true, error: "net::ERR_PROXY_CONNECTION_FAILED" };
    await vpn.signalerErreurServeur(panne);
    expect((await vpn.etat()).erreur).toBeNull();
    // A destination that cannot be reached through a working proxy is never an outage.
    for (let i = 0; i < 10; i++)
      await vpn.signalerErreurServeur({ fatal: true, error: "net::ERR_TUNNEL_CONNECTION_FAILED" });
    expect((await vpn.etat()).erreur).toBeNull();
    for (let i = 0; i < 4; i++) await vpn.signalerErreurServeur(panne);
    expect(chromeApi.action.setBadgeText).toHaveBeenLastCalledWith({ text: "!" });
    const e = await vpn.etat();
    expect(e.voulu).toBe(true);
    expect(e.erreur).toBe("serveur");
    expect(chromeApi.proxy.settings.clear).not.toHaveBeenCalledWith({ scope: "regular" });
  });
  it("l'alerte serveur s'efface seule quand une page repasse par le proxy", async () => {
    let t = 10000;
    const { chromeApi } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi, maintenant: () => t });
    await vpn.activer();
    const panne = { fatal: true, error: "net::ERR_PROXY_CONNECTION_FAILED" };
    for (let i = 0; i < 4; i++) await vpn.signalerErreurServeur(panne);
    expect((await vpn.etat()).erreur).toBe("serveur");
    await vpn.surRequeteReussie({ statusCode: 200, fromCache: false });
    expect((await vpn.etat()).erreur).toBeNull();
    expect(chromeApi.action.setBadgeText).toHaveBeenLastCalledWith({ text: "ON" });
    t += 5000;
  });
  it("au démarrage, l'état voulu est réappliqué s'il a été perdu", async () => {
    const { chromeApi } = fauxChrome({ stock: { [CLE_VPN]: { acces: ACCES, actif: true } } });
    const vpn = creerVpn({ chromeApi });
    await vpn.reappliquer();
    expect(chromeApi.proxy.settings.set).toHaveBeenCalled();
    expect((await vpn.etat()).actif).toBe(true);
  });
  it("oublier : proxy retiré et identifiants effacés", async () => {
    const { chromeApi, donnees } = fauxChrome({ stock: avecAcces });
    const vpn = creerVpn({ chromeApi });
    await vpn.activer();
    await vpn.oublier();
    expect(donnees[CLE_VPN]).toBeUndefined();
    expect((await vpn.etat()).aAcces).toBe(false);
  });
});
