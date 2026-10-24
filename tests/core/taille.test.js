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
