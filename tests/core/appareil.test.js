import { describe, expect, it } from "vitest";
import { libelleAppareil, typeAppareil } from "../../src/core/appareil.js";

const ua = (userAgent, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });

describe("appareil des sauvegardes", () => {
  it("l'extension reste « extension », quel que soit l'agent", () => {
    expect(typeAppareil("extension", ua("Mozilla/5.0 (iPhone)"))).toBe("extension");
  });
  it("application web : iPhone, iPad (même déguisé en Mac) ou navigateur", () => {
    expect(typeAppareil("pwa", ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"))).toBe("iphone");
    expect(typeAppareil("pwa", ua("Mozilla/5.0 (iPad; CPU OS 18_0)"))).toBe("ipad");
    expect(typeAppareil("pwa", ua("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5))).toBe("ipad");
    expect(typeAppareil("pwa", ua("Mozilla/5.0 (Macintosh; Intel Mac OS X)"))).toBe("navigateur");
    expect(typeAppareil("pwa", ua("Mozilla/5.0 (Windows NT 10.0)"))).toBe("navigateur");
  });
  it("libellés, y compris les sauvegardes d'avant la 3.3", () => {
    expect(libelleAppareil("extension")).toBe("Chrome");
    expect(libelleAppareil("iphone")).toBe("iPhone");
    expect(libelleAppareil("pwa")).toBe("iPhone / iPad");
    expect(libelleAppareil("inconnu")).toBe("Autre appareil");
  });
});
