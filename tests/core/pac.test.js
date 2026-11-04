import { describe, expect, it } from "vitest";
import { genererPac, valeurProxy } from "../../src/core/pac.js";
import { configProxy, estReellementActif } from "../../src/core/vpnProxy.js";

const ACCES = { domaine: "vpn.exemple.org", port: 443 };
const PROXY = "HTTPS vpn.exemple.org:443";

/** The PAC functions of a browser, simulated. isInNet only works on literal addresses. */
function evaluer(pac, hote) {
  const appels = [];
  const aEntier = (ip) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
  const env = {
    isPlainHostName: (h) => !h.includes("."),
    dnsDomainIs: (h, d) => h.endsWith(d),
    isInNet: (h, motif, masque) => {
      appels.push(["isInNet", h]);
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(h)) throw new Error("résolution DNS locale !");
      return (aEntier(h) & aEntier(masque)) === (aEntier(motif) & aEntier(masque));
    },
    dnsResolve: () => {
      throw new Error("dnsResolve interdit");
    },
    isResolvable: () => {
      throw new Error("isResolvable interdit");
    },
  };
  const f = new Function(...Object.keys(env), `${pac}; return FindProxyForURL;`)(
    ...Object.values(env),
  );
  return f(`https://${hote}/`, hote);
}

const toutSauf = { mode: "tout_sauf", exceptions: ["banque.fr", "tv.example.org"] };
const seulement = { mode: "seulement", liste: ["streaming.com"] };

describe("script PAC", () => {
  const pacA = genererPac(toutSauf, ACCES);
  const pacB = genererPac(seulement, ACCES);

  it.each([
    ["banque.fr", "DIRECT"],
    ["www.banque.fr", "DIRECT"],
    ["secure.www.banque.fr", "DIRECT"],
    ["WWW.BANQUE.FR", "DIRECT"],
    ["tv.example.org", "DIRECT"],
    ["example.org", PROXY],
    ["monbanque.fr", PROXY],
    ["banque.fr.evil.com", PROXY],
    ["autre.com", PROXY],
    ["imprimante", "DIRECT"],
    ["localhost", "DIRECT"],
    ["[::1]", "DIRECT"],
    ["192.168.1.1", "DIRECT"],
    ["10.1.2.3", "DIRECT"],
    ["172.16.0.5", "DIRECT"],
    ["172.31.255.1", "DIRECT"],
    ["172.32.0.1", PROXY],
    ["127.0.0.1", "DIRECT"],
    ["8.8.8.8", PROXY],
    ["192.169.0.1", PROXY],
  ])("tout sauf : %s → %s", (hote, attendu) => {
    expect(evaluer(pacA, hote)).toBe(attendu);
  });

  it.each([
    ["streaming.com", PROXY],
    ["www.streaming.com", PROXY],
    ["monstreaming.com", "DIRECT"],
    ["banque.fr", "DIRECT"],
    ["imprimante", "DIRECT"],
    ["192.168.0.1", "DIRECT"],
    ["8.8.8.8", "DIRECT"],
  ])("seulement : %s → %s", (hote, attendu) => {
    expect(evaluer(pacB, hote)).toBe(attendu);
  });

  it("ne résout jamais de nom : ni dnsResolve, ni isResolvable, isInNet seulement sur des IP", () => {
    for (const pac of [pacA, pacB]) {
      expect(pac).not.toMatch(/dnsResolve|isResolvable|myIpAddress/);
      for (const h of ["exemple.com", "www.banque.fr", "x.y.z", "imprimante"])
        expect(() => evaluer(pac, h)).not.toThrow();
    }
  });

  it("aucune connexion directe de secours : pas de « ; DIRECT » après le proxy", () => {
    expect(pacA).not.toMatch(/HTTPS [^"]*;\s*DIRECT/);
  });

  it("sans règle utile : pas de script (proxy simple)", () => {
    expect(genererPac({}, ACCES)).toBeNull();
    expect(genererPac({ mode: "tout_sauf", exceptions: [] }, ACCES)).toBeNull();
    expect(valeurProxy({}, ACCES, configProxy).mode).toBe("fixed_servers");
    expect(valeurProxy(toutSauf, ACCES, configProxy)).toMatchObject({
      mode: "pac_script",
      pacScript: { mandatory: true },
    });
  });

  it("mode « seulement » avec liste vide : rien par le VPN (script valide)", () => {
    const pac = genererPac({ mode: "seulement", liste: [] }, ACCES);
    expect(evaluer(pac, "exemple.com")).toBe("DIRECT");
  });

  it("serveur invalide : pas de script", () => {
    expect(genererPac(toutSauf, { domaine: '"; return "DIRECT', port: 443 })).toBeNull();
    expect(genererPac(toutSauf, { domaine: "ok.com", port: 99999 })).toBeNull();
  });

  it("injection : un domaine piégé est refusé et ne change pas la logique", () => {
    const piege = [
      '"; return "DIRECT"; //',
      'x.com"]; return "DIRECT"; var a=["',
      "a.com\nreturn 'DIRECT'",
    ];
    const pac = genererPac({ mode: "tout_sauf", exceptions: [...piege, "ok.com"] }, ACCES);
    expect(pac).not.toContain('return "DIRECT"; //');
    expect(evaluer(pac, "autre.net")).toBe(PROXY);
    expect(evaluer(pac, "ok.com")).toBe("DIRECT");
  });
});

describe("état réel avec un script", () => {
  it("reconnaît le script de ce serveur, refuse celui d'un autre", () => {
    const reglage = (data) => ({
      levelOfControl: "controlled_by_this_extension",
      value: { mode: "pac_script", pacScript: { data } },
    });
    const pac = genererPac({ mode: "tout_sauf", exceptions: ["a.com"] }, ACCES);
    expect(estReellementActif(reglage(pac), ACCES)).toBe(true);
    expect(estReellementActif(reglage(pac), { domaine: "autre.org" })).toBe(false);
  });
});
