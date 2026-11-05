import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creerExport } from "../../src/core/export.js";
import { lireSujet } from "../../src/core/sujets.js";
import { lireTodo } from "../../src/core/todos.js";

const etat = { versionSchema: 1, grille: [], reglages: {} };
const options = { version: "6.0.0", plateforme: "extension" };

describe("export des todos (V6.0)", () => {
  it("contient les sujets et les todos, sans champ interne", () => {
    const sujets = [lireSujet("s1", { nom: "Courses", ordre: 1, nbRestants: 2, nbTotal: 3 })];
    const todos = [
      lireTodo("t1", { sujetId: "s1", titre: "Pain", description: "", fait: false, ordre: 1 }, true),
    ];
    const r = creerExport(etat, { ...options, todos: { sujets, todos } });
    expect(r.todos.sujets[0]).toMatchObject({ id: "s1", nom: "Courses" });
    expect(r.todos.todos[0]).toMatchObject({ id: "t1", titre: "Pain", sujetId: "s1" });
    const texte = JSON.stringify(r.todos);
    expect(texte).not.toContain("enAttente");
    expect(texte).not.toContain("nbRestants");
  });
  it("sans todos, la clé est absente", () => {
    expect(creerExport(etat, options)).not.toHaveProperty("todos");
  });
});

describe("confidentialité (V6.0, Problème 7)", () => {
  const lister = (dossier) =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? lister(join(dossier, e.name)) : [join(dossier, e.name)],
    );
  const lire = (f) => readFileSync(f, "utf8");

  it("aucun module d'IA, de chat ou de journal ne touche aux todos", () => {
    const fichiers = [
      ...lister("src/core").filter((f) => /ia|chat|listeCompacte|preFiltre|journal|confidentialite/i.test(f)),
      ...lister("src/ui/chat"),
      "src/firebase/ia.js",
      "src/firebase/iaFlux.js",
    ];
    for (const f of fichiers) {
      const source = lire(f);
      expect(source, f).not.toMatch(/core\/todos|core\/sujets|firebase\/todos|from "\.\/todos|from "\.\/sujets/);
    }
  });
  it("le journal ne reçoit ni titre ni description de todo", () => {
    const source = lire("src/firebase/todos.js");
    expect(source).not.toMatch(/journal|console\./);
  });
});
