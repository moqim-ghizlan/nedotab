import { describe, expect, it } from "vitest";
import { creerDossier, creerSite, etatInitial } from "../../src/core/modele.js";

describe("modele", () => {
  it("creerSite refuse un titre ou une URL vide", () => {
    expect(() => creerSite({ titre: "", url: "https://a.com" })).toThrow();
    expect(() => creerSite({ titre: "A", url: "  " })).toThrow();
  });
  it("creerSite renvoie un nouvel objet complet", () => {
    const icone = { type: "lettre", couleur: "#000" };
    const s = creerSite({ titre: " A ", url: "https://a.com", icone }, () => "id1");
    expect(s).toMatchObject({ id: "id1", type: "site", titre: "A", url: "https://a.com" });
    expect(s.icone).not.toBe(icone);
    expect(typeof s.creeLe).toBe("number");
  });
  it("creerSite donne une pastille lettre par défaut", () => {
    expect(creerSite({ titre: "A", url: "https://a.com" }).icone.type).toBe("lettre");
  });
  it("creerDossier copie les items", () => {
    const items = [];
    const d = creerDossier({ titre: "D", items });
    expect(d.type).toBe("dossier");
    expect(d.items).not.toBe(items);
  });
  it("etatInitial a versionSchema 1", () => {
    expect(etatInitial()).toEqual({
      versionSchema: 1,
      grille: [],
      reglages: { theme: "auto", fond: { type: "aucun" } },
    });
  });
});
