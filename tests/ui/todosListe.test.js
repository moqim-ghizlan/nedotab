import { afterEach, describe, expect, it, vi } from "vitest";
import { creerDiffere } from "../../src/core/differe.js";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

// Captured before any fake timer replaces it.
const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));
const sujet = (id, extra = {}) => ({
  id,
  nom: id,
  ordre: 1000,
  couleur: null,
  creeLe: 1,
  nbRestants: 0,
  nbTotal: 0,
  enAttente: false,
  ...extra,
});
const todo = (id, extra = {}) => ({
  id,
  v: 1,
  sujetId: "s1",
  titre: id,
  description: "",
  echeance: null,
  fait: false,
  faitLe: null,
  creeLe: 1,
  modifieLe: 1,
  ordre: 1000,
  images: [],
  enAttente: false,
  ...extra,
});

async function monter({ todos = [], sujets = [sujet("s1"), sujet("s2")], nbTodos = todos.length } = {}) {
  let rappelTodos = null;
  const fb = {
    ecouterSujets: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel(sujets, { depuisCache: false, enAttente: false }));
      return () => {};
    }),
    ecouterCompteursTodos: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel({ nbSujets: sujets.length, nbTodos, octets: 0 }));
      return () => {};
    }),
    ecouterTodos: vi.fn((_u, _s, rappel) => {
      rappelTodos = rappel;
      queueMicrotask(() => rappel(todos, { depuisCache: false, enAttente: false, plein: false }));
      return () => {};
    }),
    creerTodo: vi.fn(async () => "nouveau"),
    majTodo: vi.fn(async () => {}),
    supprimerTodo: vi.fn(async () => {}),
    deplacerTodo: vi.fn(async () => {}),
    ecrireOrdresTodos: vi.fn(async () => {}),
    nouvelIdTodo: vi.fn(() => "id-neuf"),
  };
  const p = creerPanneauTodos({ disponible: () => true, charger: async () => fb, uid: () => "u1" });
  document.body.append(p.bouton, p.panneau);
  p.ouvrir();
  await attendre();
  await attendre();
  p.ouvrirSujet("s1");
  await attendre();
  await attendre();
  return { p, fb, pousser: (t) => rappelTodos(t, { depuisCache: false, enAttente: false, plein: false }) };
}

const lignes = (p, liste = ".todos-liste:not(.todos-liste--faits)") =>
  [...p.panneau.querySelectorAll(`${liste} .todo-ligne`)];

describe("ajout rapide", () => {
  it("Entrée ajoute un todo en début de liste (ordre avant le premier)", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { ordre: 5000 })] });
    const champ = p.panneau.querySelector(".todos-champ");
    champ.value = "  Nouveau ";
    p.panneau.querySelector(".todos-ajout").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    expect(fb.creerTodo).toHaveBeenCalledOnce();
    expect(fb.creerTodo.mock.calls[0][1]).toMatchObject({ titre: "Nouveau", sujetId: "s1", ordre: 4000 });
  });
  it("refuse une ligne vide avec un message", async () => {
    const { p, fb } = await monter();
    p.panneau.querySelector(".todos-ajout").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    expect(fb.creerTodo).not.toHaveBeenCalled();
    expect(p.panneau.querySelector(".todos-message").textContent).toMatch(/titre/);
  });
  it("500 todos : champ désactivé", async () => {
    const { p } = await monter({ nbTodos: 500 });
    expect(p.panneau.querySelector(".todos-champ").disabled).toBe(true);
    expect(p.panneau.querySelector(".todos-champ").placeholder).toBe("500 todos maximum");
  });
});

describe("liste", () => {
  it("état vide", async () => {
    const { p } = await monter();
    expect(p.panneau.textContent).toContain("Rien à faire ici. Ajoutez un todo ci-dessus.");
  });
  it("sépare À faire et Faits (N), repliés par défaut", async () => {
    const { p } = await monter({ todos: [todo("a"), todo("b", { fait: true, ordre: 2 }), todo("c", { fait: true, ordre: 3 })] });
    expect(lignes(p)).toHaveLength(1);
    const titre = p.panneau.querySelector(".todos-faits-titre");
    expect(titre.textContent).toBe("Faits (2)");
    expect(p.panneau.querySelector(".todos-liste--faits").hidden).toBe(true);
    titre.click();
    expect(p.panneau.querySelector(".todos-liste--faits").hidden).toBe(false);
    expect(lignes(p, ".todos-liste--faits")).toHaveLength(2);
  });
  it("un titre <script> s'affiche comme texte", async () => {
    const { p } = await monter({ todos: [todo("a", { titre: "<script>alert(1)</script>" })] });
    expect(p.panneau.querySelector("script")).toBeNull();
    expect(p.panneau.querySelector(".todo-titre").textContent).toBe("<script>alert(1)</script>");
  });
  it("un titre vide s'affiche « Sans titre »", async () => {
    const { p } = await monter({ todos: [todo("a", { titre: "" })] });
    expect(p.panneau.querySelector(".todo-titre").textContent).toBe("Sans titre");
  });
  it("met à jour les lignes en place (le même nœud survit à un instantané)", async () => {
    const { p, pousser } = await monter({ todos: [todo("a"), todo("b", { ordre: 2000 })] });
    const avant = lignes(p)[0];
    pousser([todo("a", { titre: "renommé" }), todo("b", { ordre: 2000 })]);
    expect(lignes(p)[0]).toBe(avant);
    expect(avant.querySelector(".todo-titre").textContent).toBe("renommé");
  });
});

describe("cocher", () => {
  it("double-clic rapide : état final = état d'origine, aucune écriture", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    const caseA = () => p.panneau.querySelector('[data-id="a"] .todo-case');
    caseA().click();
    caseA().click();
    await vi.advanceTimersByTimeAsync(400);
    expect(fb.majTodo).not.toHaveBeenCalled();
  });
  it("cinq clics rapides : une seule écriture, l'état final", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    for (let i = 0; i < 5; i++) p.panneau.querySelector('[data-id="a"] .todo-case').click();
    await vi.advanceTimersByTimeAsync(400);
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0].slice(1)).toEqual(["a", { fait: true }, { sujetId: "s1" }]);
  });
  it("l'interface bascule tout de suite (avant l'écriture)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"] .todo-case').click();
    expect(lignes(p, ".todos-liste--faits")).toHaveLength(1);
    expect(lignes(p)).toHaveLength(0);
  });
});

describe("supprimer", () => {
  it("annulation avant 5 s : aucune écriture", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Supprimer").click();
    expect(lignes(p)).toHaveLength(0);
    document.querySelector(".toast-action").click();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fb.supprimerTodo).not.toHaveBeenCalled();
    expect(lignes(p)).toHaveLength(1);
  });
  it("confirmée : une écriture avec le sujet et l'état fait", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Supprimer").click();
    await vi.advanceTimersByTimeAsync(5100);
    expect(fb.supprimerTodo).toHaveBeenCalledWith("u1", "a", { sujetId: "s1", fait: false, images: [] });
  });
});

describe("réordonner et déplacer", () => {
  it("flèche sur la poignée : un seul todo écrit, ordre entre les voisins", async () => {
    const { p, fb } = await monter({
      todos: [todo("a", { ordre: 1000 }), todo("b", { ordre: 2000 }), todo("c", { ordre: 3000 })],
    });
    p.panneau
      .querySelector('[data-id="c"] .todo-poignee')
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0].slice(1, 3)).toEqual(["c", { ordre: 1500 }]);
  });
  it("« Déplacer vers… » : un lot avec les deux sujets", async () => {
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Déplacer vers…").click();
    await attendre();
    document.querySelector(".todos-choix-sujet").click();
    await attendre();
    await attendre();
    expect(fb.deplacerTodo).toHaveBeenCalledOnce();
    expect(fb.deplacerTodo.mock.calls[0][2]).toMatchObject({ depuis: "s1", vers: "s2", fait: false });
  });
  it("destination disparue : message clair, rien n'est modifié", async () => {
    const { p, fb } = await monter({ todos: [todo("a")], sujets: [sujet("s1"), sujet("s2")] });
    const r = await p.donnees.deplacerVersSujet("a", "fantome");
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/Rien n'a été déplacé/);
    expect(fb.deplacerTodo).not.toHaveBeenCalled();
  });
});

describe("fenêtre d'édition", () => {
  const ouvrir = async (p) => {
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    await attendre();
    return document.querySelector(".todo-editeur");
  };
  const saisir = (champ, valeur) => {
    champ.value = valeur;
    champ.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("10 frappes en 1 s = 1 écriture ; fermer avant 1,5 s écrit tout de suite", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    const fen = await ouvrir(p);
    const titre = fen.querySelector(".todo-editeur-titre");
    for (let i = 1; i <= 10; i++) saisir(titre, "x".repeat(i));
    await vi.advanceTimersByTimeAsync(1600);
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0][2]).toEqual({ titre: "xxxxxxxxxx" });
    saisir(fen.querySelector(".todo-editeur-description"), "notes");
    fen.close();
    await vi.advanceTimersByTimeAsync(1);
    expect(fb.majTodo).toHaveBeenCalledTimes(2);
    expect(fb.majTodo.mock.calls[1][2]).toEqual({ description: "notes" });
  });
  it("un instantané ne remplace pas un champ qui a le focus", async () => {
    const { p, pousser } = await monter({ todos: [todo("a", { titre: "avant" })] });
    const fen = await ouvrir(p);
    const titre = fen.querySelector(".todo-editeur-titre");
    titre.focus();
    saisir(titre, "en cours");
    pousser([todo("a", { titre: "venu d'ailleurs" })]);
    expect(titre.value).toBe("en cours");
    fen.close();
  });
  it("affiche créé et modifié", async () => {
    const { p } = await monter({ todos: [todo("a", { creeLe: Date.now() - 3 * 3_600_000, modifieLe: null })] });
    const fen = await ouvrir(p);
    expect(fen.querySelector(".todo-editeur-dates").textContent).toMatch(/Créé il y a 3 h · Modifié à l'instant/);
    fen.close();
  });
});

describe("creerDiffere", () => {
  it("regroupe les appels et garde le dernier", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const d = creerDiffere(action, 1500);
    for (let i = 0; i < 10; i++) {
      d.appeler(i);
      vi.advanceTimersByTime(100);
    }
    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(action).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith(9);
  });
  it("vider() exécute tout de suite, annuler() abandonne", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const d = creerDiffere(action, 1500);
    d.appeler("a");
    d.vider();
    expect(action).toHaveBeenCalledWith("a");
    d.appeler("b");
    d.annuler();
    vi.advanceTimersByTime(5000);
    expect(action).toHaveBeenCalledOnce();
    expect(d.vider()).toBeUndefined();
  });
});
