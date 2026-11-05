import { describe, expect, it } from "vitest";
import {
  FORMAT_COMPLET,
  FORMAT_TODOS,
  TAILLE_MAX_IMPORT,
  creerExportTodos,
  nomFichierExportTodos,
  resumeImport,
  validerImportTodos,
  verifierTailleImport,
} from "../../src/core/exportTodos.js";
import { lireSujet } from "../../src/core/sujets.js";
import { lireTodo } from "../../src/core/todos.js";

const fichier = (extra = {}, format = FORMAT_TODOS) =>
  JSON.stringify({
    format,
    versionFormat: 1,
    todos: {
      sujets: [
        { id: "s1", nom: "Courses", couleur: "mer", ordre: 1000 },
        { id: "s2", nom: "Travail", couleur: null, ordre: 2000 },
      ],
      todos: [
        { id: "t1", sujetId: "s1", titre: "Pain", description: "complet", echeance: "2026-12-01", fait: false, ordre: 1000, images: [] },
        { id: "t2", sujetId: "s2", titre: "Rapport", description: "", echeance: null, fait: true, ordre: 1000, images: [{ id: "i", note: "n" }] },
      ],
    },
    ...extra,
  });

describe("export des todos", () => {
  it("fichier nedotab-todos : sujets et todos, rien d'interne", () => {
    const sujets = [lireSujet("s1", { nom: "S", nbRestants: 3, nbTotal: 4 })];
    const todos = [lireTodo("t1", { sujetId: "s1", titre: "T", description: "", fait: false, ordre: 1, images: [{ id: "i", chemin: "todos/u/t/i.webp", note: "n" }] }, true)];
    const f = creerExportTodos({ sujets, todos }, { version: "6.7.0", plateforme: "extension", maintenant: Date.UTC(2026, 10, 5) });
    expect(f).toMatchObject({ format: FORMAT_TODOS, versionFormat: 1, application: { version: "6.7.0" } });
    const texte = JSON.stringify(f);
    expect(texte).not.toContain("todos/u/t");
    expect(texte).not.toContain("nbRestants");
    expect(texte).not.toContain("enAttente");
  });
  it("nom du fichier", () => {
    expect(nomFichierExportTodos(new Date(2026, 10, 5))).toBe("nedotab-todos-2026-11-05.json");
  });
});

describe("validerImportTodos", () => {
  it("fichier valide : sujets, todos, résumé, images ignorées", () => {
    const r = validerImportTodos(fichier());
    expect(r.ok).toBe(true);
    expect(r.resume).toEqual({ nbSujets: 2, nbTodos: 2, ignores: 0, tronque: false, imagesIgnorees: 1 });
    expect(r.plan.todos[0]).toMatchObject({ ancienSujetId: "s1", titre: "Pain", echeance: "2026-12-01", fait: false });
    expect(r.plan.todos[1].fait).toBe(true);
    expect(resumeImport(r.resume)).toBe("2 sujets, 2 todos");
  });
  it("accepte aussi un export complet de l'application (clé todos)", () => {
    expect(validerImportTodos(fichier({}, FORMAT_COMPLET)).ok).toBe(true);
  });
  it("éléments invalides ignorés et comptés", () => {
    const f = JSON.stringify({
      format: FORMAT_TODOS,
      todos: {
        sujets: [{ id: "s1", nom: "OK" }, { id: "s2", nom: "" }, { nom: "sans id" }, 3],
        todos: [
          { sujetId: "s1", titre: "bon" },
          { sujetId: "s1", titre: "x".repeat(201) },
          { sujetId: "s1", titre: "a", echeance: "2026-02-30" },
          { sujetId: "s2", titre: "sujet ignoré" },
          { sujetId: "inconnu", titre: "orphelin" },
          { sujetId: "s1", titre: "b", description: 5 },
          null,
        ],
      },
    });
    const r = validerImportTodos(f);
    expect(r.ok).toBe(true);
    expect(r.resume.nbTodos).toBe(1);
    expect(r.resume.nbSujets).toBe(1);
    expect(r.resume.ignores).toBe(3 + 6);
  });
  it("respecte les limites avec l'existant et le dit", () => {
    const sujets = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, nom: `S${i}` }));
    const todos = Array.from({ length: 600 }, (_, i) => ({ sujetId: "s0", titre: `T${i}` }));
    const r = validerImportTodos(JSON.stringify({ format: FORMAT_TODOS, todos: { sujets, todos } }), { sujetsExistants: 5, todosExistants: 100 });
    expect(r.resume.nbSujets).toBe(25);
    expect(r.resume.nbTodos).toBe(400);
    expect(r.resume.tronque).toBe(true);
  });
  it("les identifiants du fichier ne sont jamais réutilisés (seulement pour relier)", () => {
    const r = validerImportTodos(fichier());
    for (const s of r.plan.sujets) expect(Object.keys(s)).not.toContain("id");
    for (const t of r.plan.todos) expect(Object.keys(t)).not.toContain("id");
  });
  it("JSON mal formé, mauvais format, pas de todos, vide", () => {
    expect(validerImportTodos("{pas du json").erreur).toMatch(/JSON/);
    expect(validerImportTodos(JSON.stringify({ format: "autre" })).erreur).toMatch(/export NedoTab/);
    expect(validerImportTodos(JSON.stringify([1])).erreur).toMatch(/export NedoTab/);
    expect(validerImportTodos(JSON.stringify({ format: FORMAT_TODOS })).erreur).toMatch(/pas de todos/);
    expect(validerImportTodos(JSON.stringify({ format: FORMAT_TODOS, todos: { sujets: [], todos: [] } })).ok).toBe(false);
    expect(validerImportTodos(42).ok).toBe(false);
  });
  it("taille : 10 Mo au plus", () => {
    expect(verifierTailleImport(TAILLE_MAX_IMPORT + 1)).toMatch(/trop gros/);
    expect(verifierTailleImport(1000)).toBeNull();
    expect(validerImportTodos("x".repeat(TAILLE_MAX_IMPORT + 1)).ok).toBe(false);
    expect(validerImportTodos(`{"format":"${FORMAT_TODOS}","todos":{"sujets":[],"todos":[]},"x":"${"a".repeat(50 * 1024 * 1024)}"}`).ok).toBe(false);
  });
  it("__proto__ et constructor : aucun effet sur les objets", () => {
    const sale = '{"format":"nedotab-todos","__proto__":{"polluted":true},"todos":{"sujets":[{"id":"s1","nom":"A","__proto__":{"polluted":true}}],"todos":[{"sujetId":"s1","titre":"B","constructor":{"prototype":{"polluted":true}},"__proto__":{"polluted":true}}]}}';
    const r = validerImportTodos(sale);
    expect(r.ok).toBe(true);
    expect({}.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(r.plan.sujets[0])).toBe(Object.prototype);
    expect(r.plan.sujets[0].polluted).toBeUndefined();
    expect(r.plan.todos[0].polluted).toBeUndefined();
  });
  it("énormes chaînes : le todo est ignoré, pas de plantage", () => {
    const f = JSON.stringify({ format: FORMAT_TODOS, todos: { sujets: [{ id: "s1", nom: "A" }], todos: [{ sujetId: "s1", titre: "ok" }, { sujetId: "s1", titre: "t", description: "d".repeat(2_000_000) }] } });
    const r = validerImportTodos(f);
    expect(r.resume.nbTodos).toBe(1);
    expect(r.resume.ignores).toBe(1);
  });
  it("noms de sujet nettoyés (contrôle, direction) et couleur inconnue remise à zéro", () => {
    const f = JSON.stringify({ format: FORMAT_TODOS, todos: { sujets: [{ id: "s1", nom: "Tra‮vail", couleur: "fluo" }], todos: [{ sujetId: "s1", titre: "t" }] } });
    const r = validerImportTodos(f);
    expect(r.plan.sujets[0]).toMatchObject({ nom: "Tra vail", couleur: null });
  });
});
