import { describe, expect, it } from "vitest";
import { cleSansSuivi, groupesDoublons, propositionGarder } from "../../src/core/doublons.js";

const site = (id, url) => ({ id, type: "site", titre: id, url });
const dossier = (id, items) => ({ id, type: "dossier", titre: id, items });
const ids = (groupes) => groupes.map((g) => g.copies.map((c) => c.id));

describe("groupesDoublons", () => {
  it("même adresse à la casse, au www, au schéma et au / final près : doublons exacts", () => {
    const { exacts, probables } = groupesDoublons([
      site("a", "https://www.Exemple.fr/"),
      site("b", "http://exemple.fr"),
      site("c", "https://autre.fr"),
    ]);
    expect(ids(exacts)).toEqual([["a", "b"]]);
    expect(probables).toEqual([]);
  });

  it("paramètres de suivi : doublons probables, pas exacts", () => {
    const { exacts, probables } = groupesDoublons([
      site("a", "https://exemple.fr/page"),
      site("b", "https://exemple.fr/page?utm_source=news&fbclid=XYZ"),
      site("c", "https://exemple.fr/page#haut"),
    ]);
    expect(exacts).toEqual([]);
    expect(ids(probables)).toEqual([["a", "b", "c"]]);
  });

  it("chemins ou paramètres utiles différents : pas des doublons", () => {
    const r = groupesDoublons([
      site("a", "https://exemple.fr/page1"),
      site("b", "https://exemple.fr/page2"),
      site("c", "https://exemple.fr/v?id=1"),
      site("d", "https://exemple.fr/v?id=2"),
    ]);
    expect(r).toEqual({ exacts: [], probables: [] });
  });

  it("copies dans des dossiers différents : le chemin de chaque copie est donné", () => {
    const { exacts } = groupesDoublons([
      site("a", "https://exemple.fr"),
      dossier("Travail", [dossier("Clients", [site("b", "https://exemple.fr/")])]),
    ]);
    expect(exacts[0].copies.map((c) => c.chemin)).toEqual([[], ["Travail", "Clients"]]);
  });

  it("grille vide ou invalide", () => {
    expect(groupesDoublons([])).toEqual({ exacts: [], probables: [] });
    expect(groupesDoublons(null)).toEqual({ exacts: [], probables: [] });
  });
});

describe("cleSansSuivi / propositionGarder", () => {
  it("ordre des paramètres sans effet, adresse illisible tolérée", () => {
    expect(cleSansSuivi("https://a.fr/p?b=1&a=2")).toBe(cleSansSuivi("https://a.fr/p?a=2&b=1"));
    expect(cleSansSuivi("pas une adresse")).toBe("pas une adresse");
  });
  it("garder une copie : les autres sont à supprimer", () => {
    const { exacts } = groupesDoublons([
      site("a", "https://x.fr"),
      site("b", "https://x.fr"),
      site("c", "https://x.fr"),
    ]);
    expect(propositionGarder(exacts[0], "b").actions).toEqual([
      { outil: "supprimer", element: "a" },
      { outil: "supprimer", element: "c" },
    ]);
  });
});
