import { describe, expect, it } from "vitest";
import {
  avecDomaine,
  LISTE_MAX,
  normaliserDomaine,
  reglesAStocker,
  routeDe,
  sansRegle,
  validerReglesVpn,
} from "../../src/core/domainesVpn.js";
import { modifierReglages, validerReglages } from "../../src/core/reglages.js";

describe("normaliserDomaine", () => {
  it.each([
    ["HTTPS://WWW.Exemple.com/page", "www.exemple.com"],
    ["exemple.com:8080/x?y=1#z", "exemple.com"],
    ["*.exemple.com", "exemple.com"],
    ["  Exemple.COM.  ", "exemple.com"],
    ["user:pw@exemple.com", "exemple.com"],
    ["bücher.example", "xn--bcher-kva.example"],
    ["localhost", "localhost"],
  ])("%s → %s", (entree, attendu) => {
    expect(normaliserDomaine(entree)).toBe(attendu);
  });
  it.each([
    "exemple..com",
    '"; return "DIRECT',
    "exemple .com",
    "a*b.com",
    "-exemple.com",
    "exemple-.com",
    "",
    "   ",
    null,
    42,
    "ex_emple.com",
    "exemple.com\nDIRECT",
    "(function(){})()",
  ])("refuse %j", (entree) => {
    expect(normaliserDomaine(entree)).toBeNull();
  });
});

describe("règles", () => {
  it("valeurs par défaut, doublons, invalides et borne de 200", () => {
    expect(validerReglesVpn(undefined)).toEqual({ mode: "tout_sauf", exceptions: [], liste: [] });
    const r = validerReglesVpn({
      mode: "n'importe quoi",
      exceptions: ["A.com", "a.com", "pas valide", "b.com"],
    });
    expect(r.mode).toBe("tout_sauf");
    expect(r.exceptions).toEqual(["a.com", "b.com"]);
    const longue = Array.from({ length: 300 }, (_, i) => `site${i}.com`);
    expect(validerReglesVpn({ liste: longue }).liste).toHaveLength(LISTE_MAX);
  });
  it("rien n'est stocké quand tout est par défaut", () => {
    expect(reglesAStocker({})).toBeUndefined();
    expect(reglesAStocker({ mode: "seulement" })).toBeDefined();
    expect(sansRegle({})).toBe(true);
    expect(sansRegle({ mode: "seulement" })).toBe(false);
  });
  it("un domaine couvre ses sous-domaines, pas un nom voisin", () => {
    const r = { mode: "tout_sauf", exceptions: ["exemple.com"] };
    expect(routeDe(r, "www.exemple.com")).toBe("direct");
    expect(routeDe(r, "exemple.com")).toBe("direct");
    expect(routeDe(r, "monexemple.com")).toBe("vpn");
    const s = { mode: "seulement", liste: ["exemple.com"] };
    expect(routeDe(s, "mail.exemple.com")).toBe("vpn");
    expect(routeDe(s, "autre.org")).toBe("direct");
  });
  it("avecDomaine ajoute et retire dans la liste du mode", () => {
    let r = avecDomaine({}, "https://banque.fr/x", "direct");
    expect(r.exceptions).toEqual(["banque.fr"]);
    r = avecDomaine(r, "banque.fr", "vpn");
    expect(r.exceptions).toEqual([]);
    r = avecDomaine({ mode: "seulement" }, "tv.fr", "vpn");
    expect(r.liste).toEqual(["tv.fr"]);
  });
});

describe("réglages synchronisés", () => {
  it("modifierReglages garde, normalise et efface les règles", () => {
    const base = validerReglages({});
    const a = modifierReglages(base, { vpn: { mode: "seulement", liste: ["X.com", "???"] } });
    expect(a.vpn).toEqual({ mode: "seulement", exceptions: [], liste: ["x.com"] });
    const b = modifierReglages(a, { vpn: { mode: "tout_sauf" } });
    expect("vpn" in b).toBe(false);
    expect(modifierReglages(base, { vpn: null })).toBe(base);
  });
  it("validerReglages nettoie des règles corrompues et ne stocke jamais d'identifiant", () => {
    const r = validerReglages({ vpn: { mode: "seulement", liste: ["a.com"], motDePasse: "x" } });
    expect(r.vpn).toEqual({ mode: "seulement", exceptions: [], liste: ["a.com"] });
    expect(JSON.stringify(r)).not.toContain("motDePasse");
  });
});
