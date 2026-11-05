import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMAT_TODOS } from "../../src/core/exportTodos.js";
import { MOT_CONFIRMATION, sectionTodos } from "../../src/ui/reglages/todos.js";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

afterEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));

function monter({ compteurs = { nbSujets: 2, nbTodos: 10, octets: 0 } } = {}) {
  const donnees = {
    etat: () => ({ compteurs }),
    lireTout: vi.fn(async () => ({
      sujets: [{ id: "s1", nom: "Courses", ordre: 1, couleur: null, creeLe: 1, modifieLe: 1, nbRestants: 1, nbTotal: 2 }],
      todos: [{ id: "t1", sujetId: "s1", titre: "Pain", description: "", fait: false, ordre: 1, images: [] }],
    })),
    importer: vi.fn(async (_plan, { surProgres }) => {
      surProgres?.(1, 2);
      return { sujets: 1, todos: 1, annule: false };
    }),
    recalculer: vi.fn(async () => ({ nbSujets: 3, nbTodos: 12 })),
    toutSupprimer: vi.fn(async () => 12),
  };
  const livrer = vi.fn(async () => "telecharge");
  const { section } = sectionTodos({ donnees, livrer, version: "6.7.0", maintenant: () => new Date(2026, 10, 5, 12) });
  document.body.append(section);
  return { donnees, livrer, section };
}
const bouton = (section, texte) => [...section.querySelectorAll("button")].find((b) => b.textContent === texte);
const etat = (section) => section.querySelector('[role="status"]').textContent;
const fichierJson = (contenu, nom = "todos.json") => new File([contenu], nom, { type: "application/json" });
const choisir = async (section, fichier) => {
  const champ = section.querySelector('input[type="file"]');
  Object.defineProperty(champ, "files", { value: [fichier], configurable: true });
  champ.dispatchEvent(new Event("change"));
  await attendre();
  await attendre();
};
const exportValide = JSON.stringify({
  format: FORMAT_TODOS,
  todos: {
    sujets: [{ id: "a", nom: "Maison" }],
    todos: [{ sujetId: "a", titre: "Peindre" }, { sujetId: "a", titre: "x".repeat(300) }],
  },
});

describe("réglages › Todos", () => {
  it("annonce que les todos ne sont pas dans les sauvegardes et que le fichier n'est pas chiffré", () => {
    const { section } = monter();
    expect(section.textContent).toContain("ne font pas partie des sauvegardes");
    expect(section.textContent).toContain("n'est pas chiffré");
  });

  it("exporte un fichier nedotab-todos daté, sans champ interne", async () => {
    const { section, livrer } = monter();
    bouton(section, "Exporter mes todos (JSON)").click();
    await attendre();
    await attendre();
    const f = livrer.mock.calls[0][0];
    expect(f.name).toBe("nedotab-todos-2026-11-05.json");
    const contenu = JSON.parse(await f.text());
    expect(contenu).toMatchObject({ format: FORMAT_TODOS, todos: { sujets: [{ nom: "Courses" }], todos: [{ titre: "Pain" }] } });
    expect(JSON.stringify(contenu)).not.toContain("nbRestants");
    expect(etat(section)).toContain("pas chiffré");
  });

  it("import : aperçu « 1 sujet, 1 todo, 1 ignoré », confirmation, puis ajout", async () => {
    const { section, donnees } = monter();
    await choisir(section, fichierJson(exportValide));
    const dialogue = document.querySelector("dialog");
    expect(dialogue.textContent).toContain("1 sujet, 1 todo, 1 ignoré — Importer ?");
    expect(dialogue.textContent).toContain("rien n'est remplacé");
    expect(donnees.importer).not.toHaveBeenCalled();
    dialogue.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    await attendre();
    expect(donnees.importer).toHaveBeenCalledOnce();
    const plan = donnees.importer.mock.calls[0][0];
    expect(plan.sujets[0]).toMatchObject({ nom: "Maison" });
    expect(plan.todos).toHaveLength(1);
    expect(etat(section)).toContain("Importé : 1 sujet(s) et 1 todo(s).");
  });

  it("import annulé dans l'aperçu : rien n'est écrit", async () => {
    const { section, donnees } = monter();
    await choisir(section, fichierJson(exportValide));
    document.querySelector('dialog [data-valeur="false"]').click();
    await attendre();
    expect(donnees.importer).not.toHaveBeenCalled();
  });

  it("fichier invalide, trop gros ou hors ligne : message, rien n'est écrit", async () => {
    const { section, donnees } = monter();
    await choisir(section, fichierJson("{ce n'est pas du json"));
    expect(etat(section)).toContain("JSON");
    const gros = fichierJson("{}");
    Object.defineProperty(gros, "size", { value: 11 * 1024 * 1024 });
    await choisir(section, gros);
    expect(etat(section)).toContain("trop gros");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await choisir(section, fichierJson(exportValide));
    expect(etat(section)).toContain("hors ligne");
    expect(donnees.importer).not.toHaveBeenCalled();
  });

  it("recalcule les compteurs", async () => {
    const { section, donnees } = monter();
    bouton(section, "Recalculer les compteurs").click();
    await attendre();
    await attendre();
    expect(donnees.recalculer).toHaveBeenCalledOnce();
    expect(etat(section)).toContain("3 sujet(s), 12 todo(s)");
  });

  it(`supprimer tout : il faut taper ${MOT_CONFIRMATION}`, async () => {
    const { section, donnees } = monter();
    bouton(section, "Supprimer tous mes todos").click();
    await attendre();
    let dialogue = document.querySelector("dialog");
    expect(dialogue.textContent).toContain("10 todo(s), 2 sujet(s)");
    dialogue.querySelector("input").value = "supprimer";
    dialogue.querySelector('[data-valeur="true"]').click();
    await attendre();
    await attendre();
    expect(donnees.toutSupprimer).not.toHaveBeenCalled();
    expect(etat(section)).toContain("Rien n'a été supprimé");

    bouton(section, "Supprimer tous mes todos").click();
    await attendre();
    dialogue = document.querySelector("dialog");
    dialogue.querySelector("input").value = MOT_CONFIRMATION;
    dialogue.querySelector('[data-valeur="true"]').click();
    await attendre();
    await attendre();
    await attendre();
    expect(donnees.toutSupprimer).toHaveBeenCalledOnce();
    expect(etat(section)).toContain("Tous vos todos ont été supprimés");
  });
});

describe("panneau : écritures en attente", () => {
  it("affiche « En attente d'envoi (N) » puis « Hors ligne · N en attente d'envoi »", async () => {
    const fb = {
      ecouterSujets: (_u, rappel) => {
        queueMicrotask(() =>
          rappel(
            [
              { id: "a", nom: "A", ordre: 1, couleur: null, creeLe: 1, nbRestants: 0, nbTotal: 0, enAttente: true },
              { id: "b", nom: "B", ordre: 2, couleur: null, creeLe: 2, nbRestants: 0, nbTotal: 0, enAttente: true },
            ],
            { depuisCache: false, enAttente: true },
          ),
        );
        return () => {};
      },
      ecouterCompteursTodos: (_u, rappel) => {
        queueMicrotask(() => rappel({ nbSujets: 2, nbTodos: 0, octets: 0 }));
        return () => {};
      },
      compterEnRetardTodos: async () => 0,
    };
    const p = creerPanneauTodos({ disponible: () => true, charger: async () => fb, uid: () => "u1" });
    document.body.append(p.bouton, p.panneau);
    p.ouvrir();
    await attendre();
    await attendre();
    expect(p.panneau.querySelector(".todos-etat").textContent).toBe("En attente d'envoi (2)");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    expect(p.panneau.querySelector(".todos-etat").textContent).toBe("Hors ligne · 2 en attente d'envoi");
  });
});
