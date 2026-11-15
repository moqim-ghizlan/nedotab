import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  TITRE_MAX,
  basculerFait,
  champsModifies,
  creerTodo,
  echeanceValide,
  exporterTodos,
  lireTodo,
  modifierTodo,
  ordreEntre,
  renumeroter,
  trierTodos,
  validerTodo,
} from "../../src/core/todos.js";

describe("echeanceValide", () => {
  it("accepte un vrai jour et refuse un jour inexistant", () => {
    expect(echeanceValide("2026-12-31")).toBe(true);
    expect(echeanceValide("2028-02-29")).toBe(true);
    expect(echeanceValide("2026-02-30")).toBe(false);
    expect(echeanceValide("2027-02-29")).toBe(false);
    expect(echeanceValide("2026-13-01")).toBe(false);
    expect(echeanceValide("2026-1-1")).toBe(false);
    expect(echeanceValide("2026-04-31")).toBe(false);
    expect(echeanceValide(null)).toBe(false);
    expect(echeanceValide(20261231)).toBe(false);
  });
});

describe("validerTodo", () => {
  it("accepte un titre vide (brouillon), 200 caractères, refuse 201", () => {
    expect(validerTodo({ titre: "" })).toBeNull();
    expect(validerTodo({ titre: "a".repeat(TITRE_MAX) })).toBeNull();
    expect(validerTodo({ titre: "a".repeat(TITRE_MAX + 1) })).toMatch(/titre/);
  });
  it("compte les emojis comme un caractère", () => {
    expect(validerTodo({ titre: "😀".repeat(TITRE_MAX) })).toBeNull();
  });
  it("description : 20 000 acceptés, 20 001 refusés", () => {
    expect(validerTodo({ description: "a".repeat(DESCRIPTION_MAX) })).toBeNull();
    expect(validerTodo({ description: "a".repeat(DESCRIPTION_MAX + 1) })).toMatch(/description/);
  });
  it("refuse une échéance invalide", () => {
    expect(validerTodo({ echeance: "2026-02-30" })).toMatch(/échéance/);
    expect(validerTodo({ echeance: "2026-12-31" })).toBeNull();
  });
});

describe("creerTodo / modifierTodo", () => {
  it("crée un todo normalisé", () => {
    const r = creerTodo({ sujetId: "s1", titre: "  Acheter du pain ", description: "a\r\nb" });
    expect(r.ok).toBe(true);
    expect(r.todo).toMatchObject({
      v: 2,
      sujetId: "s1",
      titre: "Acheter du pain",
      description: "",
      pistes: [expect.objectContaining({ titre: "", description: "a\nb", imageId: null })],
      echeance: null,
      fait: false,
      faitLe: null,
      images: [],
    });
  });
  it("refuse sans sujet", () => {
    expect(creerTodo({ titre: "x" }).ok).toBe(false);
  });
  it("modifierTodo renvoie un nouvel objet sans toucher l'original", () => {
    const base = creerTodo({ sujetId: "s1", titre: "a" }).todo;
    const r = modifierTodo(base, { titre: "b", echeance: "" });
    expect(r.ok).toBe(true);
    expect(r.todo.titre).toBe("b");
    expect(r.todo.echeance).toBeNull();
    expect(base.titre).toBe("a");
    expect(modifierTodo(base, { echeance: "2026-02-30" }).ok).toBe(false);
  });
  it("refuse plus de 10 images", () => {
    const base = creerTodo({ sujetId: "s1" }).todo;
    expect(modifierTodo(base, { images: new Array(11).fill({}) }).ok).toBe(false);
  });
});

describe("basculerFait", () => {
  it("pose faitLe en cochant, le retire en décochant", () => {
    const base = creerTodo({ sujetId: "s1", titre: "a" }).todo;
    const fait = basculerFait(base, true, 1234);
    expect(fait).toMatchObject({ fait: true, faitLe: 1234 });
    const defait = basculerFait(fait, false);
    expect(defait).toMatchObject({ fait: false, faitLe: null });
    expect(basculerFait(fait, true, 9999).faitLe).toBe(1234);
  });
  it("modifierTodo({fait}) passe par la même logique", () => {
    const base = creerTodo({ sujetId: "s1" }).todo;
    expect(modifierTodo(base, { fait: true }, 55).todo).toMatchObject({ fait: true, faitLe: 55 });
  });
});

describe("champsModifies", () => {
  it("ne renvoie que les champs changés", () => {
    const a = creerTodo({ sujetId: "s1", titre: "a", description: "d" }).todo;
    const b = { ...a, titre: "b", images: [] };
    expect(champsModifies(a, b)).toEqual({ titre: "b" });
    expect(champsModifies(a, a)).toEqual({});
  });
});

describe("ordreEntre", () => {
  it("début, milieu, fin, liste vide", () => {
    expect(ordreEntre(null, null)).toBe(1000);
    expect(ordreEntre(null, 1000)).toBe(0);
    expect(ordreEntre(2000, null)).toBe(3000);
    expect(ordreEntre(1000, 2000)).toBe(1500);
  });
  it("renvoie null quand l'écart est épuisé, et renumeroter rétablit les écarts", () => {
    expect(ordreEntre(1, 1.0001)).toBeNull();
    const m = renumeroter([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect([...m.values()]).toEqual([1000, 2000, 3000]);
  });
});

describe("trierTodos", () => {
  it("trie par ordre, puis création, puis id ; un todo en attente (creeLe null) passe après", () => {
    const l = [
      { id: "c", ordre: 1, creeLe: null },
      { id: "b", ordre: 1, creeLe: 10 },
      { id: "a", ordre: 1, creeLe: 10 },
      { id: "z", ordre: 0, creeLe: 99 },
    ];
    expect(trierTodos(l).map((t) => t.id)).toEqual(["z", "a", "b", "c"]);
  });
});

describe("lireTodo", () => {
  const brut = {
    v: 1,
    sujetId: "s1",
    titre: "t",
    description: "d",
    echeance: "2026-12-31",
    fait: false,
    faitLe: null,
    ordre: 1000,
    images: [],
    creeLe: { toMillis: () => 5 },
    modifieLe: null,
  };
  it("normalise un document valide", () => {
    expect(lireTodo("x", brut)).toMatchObject({ id: "x", creeLe: 5, modifieLe: null, fait: false });
  });
  it("ignore un document invalide", () => {
    expect(lireTodo("x", null)).toBeNull();
    expect(lireTodo("x", { ...brut, sujetId: 3 })).toBeNull();
    expect(lireTodo("x", { ...brut, titre: 4 })).toBeNull();
    expect(lireTodo("x", { ...brut, echeance: "2026-02-30" })).toBeNull();
    expect(lireTodo("x", { ...brut, titre: "a".repeat(201) })).toBeNull();
  });
  it("écarte les images mal formées", () => {
    const t = lireTodo("x", { ...brut, images: [{ id: "i", chemin: "todos/u/x/i.webp", note: "n" }, 3, {}] });
    expect(t.images).toHaveLength(1);
  });
});

describe("exporterTodos", () => {
  it("n'exporte ni chemin de stockage ni champ interne", () => {
    const t = lireTodo("x", {
      sujetId: "s1",
      titre: "t",
      description: "",
      fait: true,
      faitLe: 3,
      ordre: 1,
      images: [{ id: "i", chemin: "todos/u/x/i.webp", note: "n", taille: 5, typeMime: "image/webp" }],
    });
    const [e] = exporterTodos([t]);
    expect(JSON.stringify(e)).not.toContain("todos/u");
    expect(e).not.toHaveProperty("enAttente");
    expect(e.images[0]).toMatchObject({ id: "i", note: "n" });
  });
});
