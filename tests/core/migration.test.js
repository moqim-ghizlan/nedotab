import { describe, expect, it, vi } from "vitest";
import { migrer, valider } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";

describe("migration", () => {
  it("null donne l'état initial", () => {
    expect(migrer(null)).toEqual({ etat: etatInitial(), lectureSeule: false });
  });
  it("sans versionSchema : migré jusqu'à la version 3", () => {
    const { etat } = migrer({ grille: [] });
    expect(etat.versionSchema).toBe(3);
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

describe("migration 2 → 3 (V4.2) : tags et description", () => {
  const ancien = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 1 });
  const grille = () => [
    ancien("a"),
    {
      id: "d1",
      type: "dossier",
      titre: "D1",
      creeLe: 1,
      items: [
        ancien("b"),
        {
          id: "d2",
          type: "dossier",
          titre: "D2",
          creeLe: 1,
          items: [
            ancien("c"),
            { id: "d3", type: "dossier", titre: "D3", creeLe: 1, items: [ancien("d")] },
          ],
        },
      ],
    },
  ];
  const sites = (liste) => liste.flatMap((e) => (e.type === "dossier" ? sites(e.items) : [e]));

  it("grille sur 3 niveaux : chaque site reçoit les quatre champs, les dossiers sont intacts", () => {
    const { etat, lectureSeule } = migrer({ versionSchema: 2, grille: grille(), reglages: {} });
    expect(lectureSeule).toBe(false);
    expect(etat.versionSchema).toBe(3);
    const tous = sites(etat.grille);
    expect(tous.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    for (const s of tous) {
      expect(s.tags).toEqual([]);
      expect(s.description).toBe("");
      expect(s.tagsManuels).toBe(false);
      expect(s.ia).toEqual({ etat: "aucun", majLe: null });
    }
    expect(etat.grille[1]).not.toHaveProperty("tags");
    expect(etat.grille[0].titre).toBe("a");
  });

  it("idempotente : migrer deux fois donne le même état qu'une fois", () => {
    const une = migrer({ versionSchema: 2, grille: grille(), reglages: {} }).etat;
    const deux = migrer(une).etat;
    expect(deux).toEqual(une);
    expect(migrer(deux).etat).toEqual(une);
  });

  it("des valeurs déjà présentes sont gardées (et nettoyées), pas écrasées", () => {
    const g = [
      {
        ...ancien("a"),
        tags: ["Jeux", "#jeux", "Vidéo"],
        description: "  Un site.  ",
        tagsManuels: true,
      },
    ];
    const { etat } = migrer({ versionSchema: 2, grille: g, reglages: {} });
    expect(etat.grille[0]).toMatchObject({
      tags: ["jeux", "vidéo"],
      description: "Un site.",
      tagsManuels: true,
    });
  });

  it("un document déjà en version 3 mais abîmé est complété à la lecture", () => {
    const { etat } = migrer({ versionSchema: 3, grille: [ancien("a")], reglages: {} });
    expect(etat.grille[0].ia).toEqual({ etat: "aucun", majLe: null });
  });

  it("une version future reste en lecture seule, sans rien modifier", () => {
    const r = migrer({ versionSchema: 4, grille: [ancien("a")], reglages: {} });
    expect(r.lectureSeule).toBe(true);
  });
});

describe("epingle (V4.21)", () => {
  it("gardé seulement quand true, idempotent", async () => {
    const { migrer } = await import("../../src/core/migration.js");
    const site = (id, extra) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0, ...extra });
    const brut = {
      versionSchema: 3,
      grille: [site("a", { epingle: true }), site("b", { epingle: "oui" }), site("c", { epingle: false })],
      reglages: {},
    };
    const un = migrer(brut).etat;
    expect(un.grille.map((s) => s.epingle)).toEqual([true, undefined, undefined]);
    expect("epingle" in un.grille[1]).toBe(false);
    expect(migrer(un).etat.grille).toEqual(un.grille);
  });
});
