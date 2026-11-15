import { describe, expect, it } from "vitest";
import {
  ID_PISTE_PRINCIPALE,
  PISTES_MAX,
  PISTE_DESCRIPTION_MAX,
  PISTE_TITRE_MAX,
  apercuPistes,
  creerPiste,
  imageDePiste,
  lirePistesBrutes,
  pisteVide,
  validerPistes,
} from "../../src/core/pistes.js";
import { champsModifies, creerTodo, lireTodo, modifierTodo } from "../../src/core/todos.js";

const hex32 = (c) => c.repeat(32);
const image = (id) => ({ id, chemin: `todos/u/t/${id}.webp`, note: "", taille: 10, typeMime: "image/webp", largeur: 1, hauteur: 1, ordre: 1000 });

describe("pistes", () => {
  it("crée une piste normalisée", () => {
    const p = creerPiste({ titre: "  Un   titre ", description: "a\r\nb" }, () => "id1");
    expect(p).toEqual({ id: "id1", titre: "Un titre", description: "a\nb", imageId: null });
    expect(pisteVide(creerPiste({}))).toBe(true);
    expect(pisteVide(p)).toBe(false);
    expect(pisteVide(creerPiste({}), true)).toBe(false);
  });

  it("valide le nombre, les tailles et les identifiants", () => {
    const ok = (n) => Array.from({ length: n }, (_, i) => creerPiste({ id: `p${i}` }));
    expect(validerPistes(ok(PISTES_MAX))).toBeNull();
    expect(validerPistes(ok(PISTES_MAX + 1))).toMatch(/pistes/);
    expect(validerPistes([creerPiste({ id: "a" }), creerPiste({ id: "a" })])).toMatch(/même identifiant/);
    expect(validerPistes([{ ...creerPiste({ id: "a" }), titre: "x".repeat(PISTE_TITRE_MAX + 1) }])).toMatch(/titre/);
    expect(validerPistes([{ ...creerPiste({ id: "a" }), description: "x".repeat(PISTE_DESCRIPTION_MAX + 1) }])).toMatch(/description/);
    expect(validerPistes([{ ...creerPiste({ id: "a" }), imageId: "court" }])).toMatch(/image/);
    expect(validerPistes("x")).toMatch(/invalides/);
  });

  it("relit des données hostiles sans planter", () => {
    const lues = lirePistesBrutes([null, 3, { id: "" }, { id: "a", titre: 5, description: {}, imageId: "x" }, { id: "a" }, { id: "b", titre: "T" }]);
    expect(lues).toEqual([
      { id: "a", titre: "", description: "", imageId: null },
      { id: "b", titre: "T", description: "", imageId: null },
    ]);
    expect(lirePistesBrutes(Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` })))).toHaveLength(PISTES_MAX);
  });
});

describe("migration d'un todo de l'ancien format", () => {
  const ancien = { sujetId: "s", titre: "Mon todo", description: "Texte", images: [image(hex32("a"))], fait: false };

  it("devient un todo à une piste avec description et image, titre conservé", () => {
    const t = lireTodo("t1", ancien);
    expect(t.titre).toBe("Mon todo");
    expect(t.pistes).toEqual([{ id: ID_PISTE_PRINCIPALE, titre: "", description: "Texte", imageId: hex32("a") }]);
    expect(imageDePiste(t, t.pistes[0]).id).toBe(hex32("a"));
  });

  it("est idempotente : relire donne la même chose", () => {
    expect(lireTodo("t1", ancien).pistes).toEqual(lireTodo("t1", ancien).pistes);
  });

  it("ne crée aucune piste pour un todo sans description ni image", () => {
    expect(lireTodo("t1", { sujetId: "s", titre: "x", description: "", images: [] }).pistes).toEqual([]);
  });

  it("n'écrit rien tant qu'on n'enregistre pas : enregistrer des pistes le passe en v2", () => {
    const t = lireTodo("t1", ancien);
    expect(t.v).toBe(1);
    const r = modifierTodo(t, { pistes: [{ ...t.pistes[0], description: "Modifié" }] });
    expect(r.ok).toBe(true);
    expect(r.todo.v).toBe(2);
    expect(r.todo.description).toBe("");
    const diff = champsModifies(t, r.todo);
    expect(Object.keys(diff).sort()).toEqual(["description", "pistes", "v"]);
    expect(diff.pistes[0].description).toBe("Modifié");
  });

  it("garde l'image même si l'on ne change que le titre du todo (aucune écriture de pistes)", () => {
    const t = lireTodo("t1", ancien);
    const r = modifierTodo(t, { titre: "Autre" });
    expect(Object.keys(champsModifies(t, r.todo))).toEqual(["titre"]);
  });
});

describe("todo à pistes (v2)", () => {
  it("lit les pistes d'un document v2 et ignore une image absente de la liste", () => {
    const t = lireTodo("t", {
      v: 2,
      sujetId: "s",
      titre: "T",
      description: "",
      images: [image(hex32("b"))],
      pistes: [{ id: "p1", titre: "A", description: "a", imageId: hex32("b") }, { id: "p2", titre: "B", description: "", imageId: hex32("c") }],
    });
    expect(t.pistes.map((p) => p.imageId)).toEqual([hex32("b"), null]);
  });

  it("refuse plus de pistes que la limite et garde l'ordre", () => {
    const base = creerTodo({ sujetId: "s", titre: "T" }).todo;
    const trop = Array.from({ length: PISTES_MAX + 1 }, (_, i) => ({ id: `p${i}` }));
    expect(modifierTodo(base, { pistes: trop }).ok).toBe(false);
    const deux = modifierTodo(base, { pistes: [{ id: "b", titre: "B" }, { id: "a", titre: "A" }] });
    expect(deux.todo.pistes.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("donne un aperçu d'une ligne", () => {
    expect(apercuPistes([{ titre: "", description: "\n\nPremière ligne\nSuite" }])).toBe("Première ligne");
    expect(apercuPistes([{ titre: "Titre", description: "x" }])).toBe("Titre");
    expect(apercuPistes([])).toBe("");
  });
});
