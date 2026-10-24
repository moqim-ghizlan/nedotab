import { describe, expect, it } from "vitest";
import { inserer, parcourir, remplacer, retirer, trouver } from "../../src/core/arbre.js";

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });
const dossier = (id, items) => ({ id, type: "dossier", titre: id, items, creeLe: 0 });

const plate = () => [site("a"), site("b"), site("c")];
// root: a, D1[ b, D2[ c, D3[ d ] ] ], e
const arbre = () => [
  site("a"),
  dossier("D1", [site("b"), dossier("D2", [site("c"), dossier("D3", [site("d")])])]),
  site("e"),
];

describe("trouver", () => {
  it("grille plate", () => {
    expect(trouver(plate(), "b")).toMatchObject({ index: 1, parent: null, chemin: [] });
    expect(trouver(plate(), "z")).toBeNull();
  });
  it("arbre imbriqué : parent et chemin", () => {
    const r = trouver(arbre(), "d");
    expect(r.parent.id).toBe("D3");
    expect(r.chemin.map((x) => x.id)).toEqual(["D1", "D2", "D3"]);
    expect(r.index).toBe(0);
  });
});

describe("retirer", () => {
  it("grille plate", () => {
    const r = retirer(plate(), "b");
    expect(r.grille.map((x) => x.id)).toEqual(["a", "c"]);
    expect(r).toMatchObject({ parentId: null, index: 1 });
  });
  it("au fond de l'arbre, sans muter l'original", () => {
    const g = arbre();
    const avant = structuredClone(g);
    const r = retirer(g, "c");
    expect(r.parentId).toBe("D2");
    expect(trouver(r.grille, "c")).toBeNull();
    expect(g).toEqual(avant);
    expect(r.grille[0]).toBe(g[0]); // untouched branches are shared
    expect(r.grille[2]).toBe(g[2]);
  });
  it("id inconnu", () => {
    expect(retirer(arbre(), "zz")).toBeNull();
  });
});

describe("inserer", () => {
  it("racine, index borné", () => {
    expect(inserer(plate(), site("x"), null, 99).map((x) => x.id)).toEqual(["a", "b", "c", "x"]);
    expect(inserer(plate(), site("x"), null, -5)[0].id).toBe("x");
    expect(inserer(plate(), site("x")).at(-1).id).toBe("x");
  });
  it("dans un sous-sous-dossier", () => {
    const g = inserer(arbre(), site("x"), "D3", 0);
    expect(trouver(g, "x").parent.id).toBe("D3");
    expect(trouver(g, "d").index).toBe(1);
  });
  it("dossier inconnu : grille inchangée", () => {
    const g = arbre();
    expect(inserer(g, site("x"), "zz")).toBe(g);
  });
});

describe("remplacer", () => {
  it("dans l'arbre", () => {
    const g = remplacer(arbre(), "d", (e) => ({ ...e, titre: "D!" }));
    expect(trouver(g, "d").element.titre).toBe("D!");
  });
  it("id inconnu ou fonction identité : même référence", () => {
    const g = arbre();
    expect(remplacer(g, "zz", (e) => ({ ...e }))).toBe(g);
    expect(remplacer(g, "d", (e) => e)).toBe(g);
  });
});

describe("parcourir", () => {
  it("profondeur d'abord", () => {
    expect([...parcourir(arbre())].map((x) => x.id)).toEqual([
      "a",
      "D1",
      "b",
      "D2",
      "c",
      "D3",
      "d",
      "e",
    ]);
  });
});
