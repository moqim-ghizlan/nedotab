import { describe, expect, it } from "vitest";
import { etatInitial } from "../../src/core/modele.js";
import { estimerTaille, niveauTaille, octetsUtf8 } from "../../src/core/taille.js";

describe("taille du document", () => {
  it("octetsUtf8 = longueur UTF-8 réelle", () => {
    for (const t of ["abc", "été", "✈️", "𝄞", "日本"]) {
      expect(octetsUtf8(t)).toBe(Buffer.byteLength(t, "utf8"));
    }
  });
  it("estimerTaille cohérent avec le JSON réel, sans les réglages de l'appareil", () => {
    const etat = {
      ...etatInitial(),
      grille: [{ id: "é", titre: "Météo" }],
      reglagesAppareil: { fond: { type: "image", ref: "local:x".repeat(500) } },
    };
    const attendu = Buffer.byteLength(
      JSON.stringify({ versionSchema: 2, grille: etat.grille, reglages: etat.reglages }),
      "utf8",
    );
    expect(estimerTaille(etat)).toBe(attendu);
  });
  it("niveaux", () => {
    expect(niveauTaille(1000)).toBe("ok");
    expect(niveauTaille(800 * 1024)).toBe("avertissement");
    expect(niveauTaille(950 * 1024)).toBe("bloque");
  });
});

describe("taille avec tags et description (V4.2)", () => {
  it("500 sites vides : la migration ajoute peu (≈ 90 octets par site)", async () => {
    const { champsEnrichissement } = await import("../../src/core/tags.js");
    const { estimerTaille } = await import("../../src/core/taille.js");
    const sites = Array.from({ length: 500 }, (_, i) => ({
      id: `s${i}`,
      type: "site",
      titre: `Site ${i}`,
      url: `https://site${i}.example.com`,
      icone: { type: "lettre", couleur: "#2c6b5a" },
      creeLe: 1,
    }));
    const avant = estimerTaille({ versionSchema: 2, grille: sites, reglages: {} });
    const apres = estimerTaille({
      versionSchema: 3,
      grille: sites.map((s) => ({ ...s, ...champsEnrichissement(s) })),
      reglages: {},
    });
    expect(apres - avant).toBeLessThan(60 * 1024);
  });

  it("500 sites avec 10 tags et une description pleine : sous le seuil d'avertissement (800 Ko)", async () => {
    const { estimerTaille, SEUIL_AVERTISSEMENT } = await import("../../src/core/taille.js");
    const sites = Array.from({ length: 500 }, (_, i) => ({
      id: `s${i}`,
      type: "site",
      titre: `Site ${i}`,
      url: `https://site${i}.example.com`,
      icone: { type: "lettre", couleur: "#2c6b5a" },
      creeLe: 1,
      tags: Array.from({ length: 10 }, (_, k) => `tag-numero-${k}-abcdefghij`),
      description: "d".repeat(300),
      tagsManuels: false,
      ia: { etat: "ok", majLe: 1 },
    }));
    expect(estimerTaille({ versionSchema: 3, grille: sites, reglages: {} })).toBeLessThan(
      SEUIL_AVERTISSEMENT,
    );
  });
});
