import { describe, expect, it } from "vitest";
import { drapeau, nomPays } from "../../src/core/drapeau.js";
import {
  ajouterHistorique,
  comparerIp,
  couleurEtat,
  diagnostiquer,
  lireCountryIs,
  lireTraceCloudflare,
  premiereReponse,
  SERVICES,
} from "../../src/core/diagnosticVpn.js";

const ECHO = { ip: "1.2.3.4", pays: "FR" };
const base = { actif: true, voulu: true, echo: ECHO, latences: [100, 200, 300] };

describe("drapeau", () => {
  it("FR → 🇫🇷, minuscules acceptées, invalide → vide", () => {
    expect(drapeau("FR")).toBe("🇫🇷");
    expect(drapeau("de")).toBe("🇩🇪");
    for (const v of ["", "F", "FRA", "1A", null, undefined, 5]) expect(drapeau(v)).toBe("");
  });
  it("nom du pays en français", () => {
    expect(nomPays("fr")).toBe("France");
    expect(nomPays("??")).toBe("");
  });
});

describe("lecture des services", () => {
  it("trace Cloudflare", () => {
    expect(lireTraceCloudflare("fl=1\nip=1.2.3.4\nloc=fr\n")).toEqual({
      ip: "1.2.3.4",
      pays: "FR",
    });
    expect(lireTraceCloudflare("ip=pas-une-ip\nloc=FR")).toBeNull();
    expect(lireTraceCloudflare(null)).toBeNull();
  });
  it("country.is, pays invalide ignoré", () => {
    expect(lireCountryIs({ ip: "2001:db8::1", country: "DE" })).toEqual({
      ip: "2001:db8::1",
      pays: "DE",
    });
    expect(lireCountryIs({ ip: "1.2.3.4", country: "x" })).toEqual({ ip: "1.2.3.4", pays: null });
    expect(lireCountryIs({})).toBeNull();
  });
  it("repli sur le second service si le premier est inutilisable", () => {
    const [a, b] = SERVICES;
    const r = premiereReponse([
      { service: a, valeur: "n'importe quoi" },
      { service: b, valeur: { ip: "5.6.7.8", country: "NL" } },
    ]);
    expect(r).toMatchObject({ ip: "5.6.7.8", pays: "NL", service: "country.is" });
    expect(premiereReponse([{ service: a, valeur: "x" }])).toBeNull();
  });
});

describe("comparaison des adresses", () => {
  it("égal, différent, familles différentes ou inconnu", () => {
    expect(comparerIp("1.2.3.4", "1.2.3.4")).toBe("egal");
    expect(comparerIp("1.2.3.4", "1.2.3.5")).toBe("different");
    expect(comparerIp("1.2.3.4", "2001:db8::1")).toBe("inconnu");
    expect(comparerIp("1.2.3.4", null)).toBe("inconnu");
  });
});

describe("diagnostic", () => {
  it("IP vue = IP du serveur → ok, avec pays, IP et latence moyenne", () => {
    const d = diagnostiquer({ ...base, ipServeur: "1.2.3.4", ipNormale: "9.9.9.9" });
    expect(d.global).toBe("ok");
    expect(d.latenceMs).toBe(200);
    expect(d.message).toContain("FR (1.2.3.4)");
    expect(d.etapes.find((e) => e.id === "ip").statut).toBe("ok");
  });
  it("IP vue = IP normale → trafic hors VPN, alerte", () => {
    const d = diagnostiquer({ ...base, ipServeur: "5.5.5.5", ipNormale: "1.2.3.4" });
    expect(d.global).toBe("fuite");
    expect(d.action).toBe("desactiver");
    expect(d.message).toMatch(/ne passe pas par le VPN/);
  });
  it("ni le serveur ni l'IP normale : incertain, jamais une fausse alerte", () => {
    const d = diagnostiquer({ ...base, ipServeur: "5.5.5.5", ipNormale: "9.9.9.9" });
    expect(d.global).toBe("incertain");
  });
  it("IP normale inconnue et serveur inconnu : incertain", () => {
    expect(diagnostiquer({ ...base }).global).toBe("incertain");
  });
  it("serveur muet → échec à la connexion, action Réessayer", () => {
    const d = diagnostiquer({ ...base, echo: null, erreurVpn: "serveur" });
    expect(d).toMatchObject({ global: "echec", action: "reessayer" });
    expect(d.etapes.find((e) => e.id === "connexion").statut).toBe("echec");
  });
  it("identifiants refusés → échec à l'authentification", () => {
    const d = diagnostiquer({ ...base, echo: null, erreurVpn: "identifiants" });
    expect(d).toMatchObject({ global: "echec", action: "identifiants" });
    expect(d.etapes.find((e) => e.id === "auth").statut).toBe("echec");
  });
  it("aucun service de test ne répond → échec au site public", () => {
    const d = diagnostiquer({ ...base, echo: null });
    expect(d.etapes.find((e) => e.id === "site").statut).toBe("echec");
  });
  it("voulu mais pas réellement actif (autre extension) → échec, désactiver", () => {
    expect(diagnostiquer({ actif: false, voulu: true, echo: null })).toMatchObject({
      global: "echec",
      action: "desactiver",
    });
  });
  it("VPN éteint → inactif", () => {
    expect(diagnostiquer({ actif: false, voulu: false, echo: null }).global).toBe("inactif");
  });
});

describe("couleur et historique", () => {
  const t = 1_000_000;
  it("vert récent, orange ancien ou inconnu, rouge en échec", () => {
    expect(couleurEtat({ global: "ok", le: t - 1000 }, t)).toBe("ok");
    expect(couleurEtat({ global: "ok", le: t - 3_600_000 }, t)).toBe("attente");
    expect(couleurEtat({ global: "incertain", le: t }, t)).toBe("attente");
    expect(couleurEtat(null, t)).toBe("attente");
    expect(couleurEtat({ global: "fuite", le: t }, t)).toBe("echec");
  });
  it("l'historique garde les 10 derniers", () => {
    let h = [];
    for (let i = 0; i < 12; i += 1) h = ajouterHistorique(h, { le: i });
    expect(h).toHaveLength(10);
    expect(h[0].le).toBe(11);
  });
});
