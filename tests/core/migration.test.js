import { describe, expect, it, vi } from "vitest";
import { migrer, valider } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";

describe("migration", () => {
  it("null donne l'état initial", () => {
    expect(migrer(null)).toEqual({ etat: etatInitial(), lectureSeule: false });
  });
  it("sans versionSchema : migré jusqu'à la version 2", () => {
    const { etat } = migrer({ grille: [] });
    expect(etat.versionSchema).toBe(2);
  });
  it("version future : lecture seule, données conservées", () => {
    const r = migrer({
      versionSchema: 99,
      grille: [{ id: "a", type: "site", titre: "A", url: "https://a.com" }],
    });
    expect(r.lectureSeule).toBe(true);
    expect(r.etat.grille).toHaveLength(1);
  });
  it("élément invalide ignoré et signalé, sans planter", () => {
    const signale = vi.fn();
    const etat = valider(
      {
        versionSchema: 1,
        grille: [{ id: "a", type: "site", titre: "A", url: "https://a.com" }, { type: "?" }, null],
      },
      signale,
    );
    expect(etat.grille).toHaveLength(1);
    expect(signale).toHaveBeenCalledWith([{ type: "?" }, null]);
  });
  it("valide aussi l'intérieur des dossiers", () => {
    const etat = valider(
      { grille: [{ id: "d", type: "dossier", titre: "D", items: [{ id: "x" }] }] },
      () => {},
    );
    expect(etat.grille[0].items).toEqual([]);
  });
});
