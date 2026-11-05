import { describe, expect, it } from "vitest";
import {
  afficherTodos,
  filtrerTodos,
  indexerTodos,
  rechercherTodos,
  segmenterSurbrillance,
  trierPar,
} from "../../src/core/rechercheTodos.js";

const now = new Date(2026, 10, 5, 12);
const t = (id, extra = {}) => ({
  id,
  titre: id,
  description: "",
  echeance: null,
  fait: false,
  ordre: 1000,
  creeLe: 1,
  modifieLe: 1,
  ...extra,
});

describe("recherche", () => {
  const todos = [
    t("a", { titre: "Éclair au chocolat", description: "recette de **Pâtisserie**" }),
    t("b", { titre: "Appeler le garage" }),
    t("c", { titre: "Acheter du pain", description: "boulangerie du coin" }),
  ];
  const index = indexerTodos(todos);
  it("sans accents ni casse", () => {
    expect([...rechercherTodos(index, "eclair")]).toEqual(["a"]);
    expect([...rechercherTodos(index, "ÉCLAIR")]).toEqual(["a"]);
    expect([...rechercherTodos(index, "patisserie")]).toEqual(["a"]);
  });
  it("mot partiel, plusieurs mots (tous requis), description, aucun résultat", () => {
    expect([...rechercherTodos(index, "gara")]).toEqual(["b"]);
    expect([...rechercherTodos(index, "acheter pain")]).toEqual(["c"]);
    expect([...rechercherTodos(index, "acheter chocolat")]).toEqual([]);
    expect([...rechercherTodos(index, "boulang")]).toEqual(["c"]);
    expect([...rechercherTodos(index, "zzz")]).toEqual([]);
  });
  it("une requête vide ne filtre rien (null)", () => {
    expect(rechercherTodos(index, "   ")).toBeNull();
  });
  it("500 todos en moins de 20 ms", () => {
    const grand = Array.from({ length: 500 }, (_, i) =>
      t(`t${i}`, { titre: `Tâche numéro ${i}`, description: "lorem ipsum ".repeat(50) }),
    );
    const idx = indexerTodos(grand);
    const debut = performance.now();
    const ids = rechercherTodos(idx, "numero 49");
    expect(performance.now() - debut).toBeLessThan(20);
    expect(ids.size).toBeGreaterThan(0);
  });
});

describe("filtres", () => {
  const todos = [
    t("a", { echeance: "2026-11-01" }),
    t("b", { echeance: "2026-11-05" }),
    t("c", { fait: true, echeance: "2026-11-01" }),
    t("d"),
  ];
  const ids = (l) => l.map((x) => x.id);
  it("chaque filtre", () => {
    expect(ids(filtrerTodos(todos, "tous", now))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filtrerTodos(todos, "afaire", now))).toEqual(["a", "b", "d"]);
    expect(ids(filtrerTodos(todos, "faits", now))).toEqual(["c"]);
    expect(ids(filtrerTodos(todos, "retard", now))).toEqual(["a"]);
    expect(ids(filtrerTodos(todos, "sansEcheance", now))).toEqual(["d"]);
  });
});

describe("tris", () => {
  const todos = [
    t("a", { echeance: "2026-11-10", ordre: 3, creeLe: 10, modifieLe: 50 }),
    t("b", { echeance: null, ordre: 2, creeLe: 30, modifieLe: 20 }),
    t("c", { echeance: "2026-11-02", ordre: 1, creeLe: 20, modifieLe: null }),
  ];
  const ids = (l) => l.map((x) => x.id);
  it("manuel, échéance (sans date en dernier), création et modification (récent d'abord)", () => {
    expect(ids(trierPar(todos, "manuel"))).toEqual(["c", "b", "a"]);
    expect(ids(trierPar(todos, "echeance"))).toEqual(["c", "a", "b"]);
    expect(ids(trierPar(todos, "creation"))).toEqual(["b", "c", "a"]);
    expect(ids(trierPar(todos, "modification"))).toEqual(["c", "a", "b"]);
  });
  it("tri stable à égalité", () => {
    const egaux = [t("z", { echeance: "2026-11-02" }), t("y", { echeance: "2026-11-02" })];
    expect(ids(trierPar(egaux, "echeance"))).toEqual(["y", "z"]);
  });
  it("chaque combinaison filtre × tri s'applique sans erreur", () => {
    for (const f of ["tous", "afaire", "faits", "retard", "sansEcheance"])
      for (const tri of ["manuel", "echeance", "creation", "modification"])
        expect(() => afficherTodos(todos, { filtre: f, tri }, now)).not.toThrow();
  });
});

describe("surbrillance", () => {
  const texte = (s) => s.map((x) => (x.marque ? `[${x.texte}]` : x.texte)).join("");
  it("marque sans accents ni casse et garde le texte d'origine", () => {
    expect(texte(segmenterSurbrillance("Éclair au chocolat", "eclair"))).toBe("[Éclair] au chocolat");
    expect(texte(segmenterSurbrillance("Éclair au chocolat", "au choc"))).toBe("Éclair [au] [choc]olat");
  });
  it("sans requête : un seul segment ; texte vide ; caractère spécial", () => {
    expect(segmenterSurbrillance("abc", "")).toEqual([{ texte: "abc", marque: false }]);
    expect(segmenterSurbrillance("", "a")).toEqual([{ texte: "", marque: false }]);
    expect(texte(segmenterSurbrillance("<b>x</b>", "x"))).toBe("<b>[x]</b>");
  });
});
