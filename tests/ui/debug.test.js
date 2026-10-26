import { describe, expect, it } from "vitest";
import { brancherGesteVersion, debugParUrl, modeDebug } from "../../src/ui/debug.js";

const stockageMemoire = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe("debugParUrl", () => {
  it("?debug active le mode pour la session, même après un changement d'adresse", () => {
    const stockage = stockageMemoire();
    expect(debugParUrl({ search: "?debug" }, stockage)).toBe(true);
    expect(debugParUrl({ search: "" }, stockage)).toBe(true);
  });
  it("sans ?debug : inactif", () => {
    expect(debugParUrl({ search: "" }, stockageMemoire())).toBe(false);
  });
});

describe("modeDebug", () => {
  const store = (debug) => ({ lire: () => ({ reglagesAppareil: { debug } }) });
  it("actif par l'URL ou par l'interrupteur de l'appareil", () => {
    expect(modeDebug(store(false), false)).toBe(false);
    expect(modeDebug(store(true), false)).toBe(true);
    expect(modeDebug(store(false), true)).toBe(true);
  });
});

describe("geste caché sur la version", () => {
  const taper = (element, n) => {
    for (let i = 0; i < n; i++) element.dispatchEvent(new MouseEvent("click"));
  };

  it("7 touchers rapprochés basculent le mode", () => {
    const p = document.createElement("p");
    let appels = 0;
    let t = 0;
    brancherGesteVersion(
      p,
      () => appels++,
      () => (t += 200),
    );
    taper(p, 6);
    expect(appels).toBe(0);
    taper(p, 1);
    expect(appels).toBe(1);
    taper(p, 7);
    expect(appels).toBe(2);
  });

  it("des touchers trop espacés ne comptent pas", () => {
    const p = document.createElement("p");
    let appels = 0;
    let t = 0;
    brancherGesteVersion(
      p,
      () => appels++,
      () => (t += 1000),
    );
    taper(p, 20);
    expect(appels).toBe(0);
  });
});
