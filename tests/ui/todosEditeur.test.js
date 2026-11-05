// @vitest-environment jsdom
// The preview goes through DOMPurify, which needs a faithful DOM (jsdom).
import { afterEach, describe, expect, it, vi } from "vitest";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

// jsdom has no showModal / close on <dialog>: the minimum for these tests.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

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

async function monter({ todos = [] } = {}) {
  let rappelTodos = null;
  const fb = {
    ecouterSujets: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel([sujet("s1"), sujet("s2")], { depuisCache: false, enAttente: false }));
      return () => {};
    }),
    ecouterCompteursTodos: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel({ nbSujets: 2, nbTodos: todos.length, octets: 0 }));
      return () => {};
    }),
    ecouterTodos: vi.fn((_u, _s, rappel) => {
      rappelTodos = rappel;
      queueMicrotask(() => rappel(todos, { depuisCache: false, enAttente: false, plein: false }));
      return () => {};
    }),
    creerTodo: vi.fn(async () => {}),
    majTodo: vi.fn(async () => {}),
    supprimerTodo: vi.fn(async () => {}),
    deplacerTodo: vi.fn(async () => {}),
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
  return {
    p,
    fb,
    pousser: (t) => rappelTodos(t, { depuisCache: false, enAttente: false, plein: false }),
    nouveau: () => p.panneau.querySelector(".todos-bouton-ajout--editeur").click(),
  };
}

const editeur = () => document.querySelector(".todo-editeur");
const saisir = (champ, valeur) => {
  champ.value = valeur;
  champ.dispatchEvent(new Event("input", { bubbles: true }));
};
const echap = (fen) => fen.dispatchEvent(new Event("cancel", { cancelable: true }));

describe("création paresseuse", () => {
  it("ouvrir et fermer 10 fois sans rien taper = 0 écriture", async () => {
    const { fb, nouveau } = await monter();
    for (let i = 0; i < 10; i++) {
      nouveau();
      const fen = editeur();
      expect(fen).not.toBeNull();
      echap(fen);
      await attendre();
      await attendre();
    }
    expect(fb.nouvelIdTodo).not.toHaveBeenCalled();
    expect(fb.creerTodo).not.toHaveBeenCalled();
    expect(fb.majTodo).not.toHaveBeenCalled();
  });

  it("un champ d'espaces ne crée rien", async () => {
    const { fb, nouveau } = await monter();
    nouveau();
    saisir(editeur().querySelector("#todo-titre"), "   ");
    echap(editeur());
    await attendre();
    await attendre();
    expect(fb.creerTodo).not.toHaveBeenCalled();
  });

  it("la description d'abord : le todo est créé à la première saisie, puis mis à jour", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fb, nouveau } = await monter();
    nouveau();
    const fen = editeur();
    saisir(fen.querySelector("#todo-description"), "d'abord le texte");
    await vi.advanceTimersByTimeAsync(1600);
    expect(fb.creerTodo).toHaveBeenCalledOnce();
    expect(fb.creerTodo.mock.calls[0][1]).toMatchObject({ titre: "", description: "d'abord le texte", sujetId: "s1" });
    expect(fb.creerTodo.mock.calls[0][2]).toBe("id-neuf");
    saisir(fen.querySelector("#todo-titre"), "Mon titre");
    await vi.advanceTimersByTimeAsync(1600);
    expect(fb.creerTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0].slice(1, 3)).toEqual(["id-neuf", { titre: "Mon titre" }]);
  });

  it("l'échéance seule suffit à créer le todo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fb, nouveau } = await monter();
    nouveau();
    const date = editeur().querySelector("#todo-echeance");
    date.value = "2026-12-31";
    date.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);
    expect(fb.creerTodo.mock.calls[0][1]).toMatchObject({ echeance: "2026-12-31" });
  });

  it("10 frappes = 1 écriture ; Échap envoie avant de fermer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fb, nouveau } = await monter();
    nouveau();
    const fen = editeur();
    const titre = fen.querySelector("#todo-titre");
    for (let i = 1; i <= 10; i++) saisir(titre, "x".repeat(i));
    await vi.advanceTimersByTimeAsync(100);
    expect(fb.creerTodo).not.toHaveBeenCalled();
    echap(fen);
    await vi.advanceTimersByTimeAsync(10);
    await attendre();
    expect(fb.creerTodo).toHaveBeenCalledOnce();
    expect(fb.creerTodo.mock.calls[0][1].titre).toBe("xxxxxxxxxx");
    expect(editeur()).toBeNull();
  });
});

describe("synchro et saisie", () => {
  it("un champ occupé (focus, composition IME, saisie en attente) n'est jamais écrasé", async () => {
    const { pousser, p } = await monter({ todos: [todo("a", { titre: "avant", description: "desc" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const fen = editeur();
    const description = fen.querySelector("#todo-description");
    description.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    description.value = "é en composit";
    pousser([todo("a", { titre: "avant", description: "autre appareil" })]);
    expect(description.value).toBe("é en composit");
    // The banner tells about the other device's change, nothing was overwritten.
    expect(fen.querySelector(".todo-editeur-bandeau").hidden).toBe(false);
    fen.dispatchEvent(new Event("cancel", { cancelable: true }));
  });

  it("« Recharger » prend la version de l'autre appareil", async () => {
    const { pousser, p } = await monter({ todos: [todo("a", { description: "desc" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const fen = editeur();
    const description = fen.querySelector("#todo-description");
    description.focus();
    saisir(description, "ma version");
    pousser([todo("a", { description: "version distante" })]);
    fen.querySelector(".todo-editeur-bandeau .lien-discret").click();
    expect(description.value).toBe("version distante");
    expect(fen.querySelector(".todo-editeur-bandeau").hidden).toBe(true);
  });

  it("un champ libre est mis à jour par un instantané", async () => {
    const { pousser, p } = await monter({ todos: [todo("a", { titre: "avant" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    pousser([todo("a", { titre: "après" })]);
    expect(editeur().querySelector("#todo-titre").value).toBe("après");
  });
});

describe("aperçu Markdown", () => {
  it("bascule Écrire / Aperçu, avec un libellé accessible, et rend le Markdown assaini", async () => {
    const { p } = await monter({
      todos: [todo("a", { description: "**gras** <script>alert(1)</script> [x](javascript:alert(1)) ![p](http://t.example/p.gif)" })],
    });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const fen = editeur();
    const apercu = fen.querySelector(".todo-editeur-apercu");
    expect(apercu.hidden).toBe(true);
    fen.querySelector('[aria-label="Aperçu"]').click();
    expect(apercu.hidden).toBe(false);
    expect(apercu.getAttribute("aria-label")).toBe("Aperçu de la description");
    expect(apercu.querySelector("strong").textContent).toBe("gras");
    expect(apercu.querySelector("script")).toBeNull();
    expect(apercu.querySelector("img")).toBeNull();
    expect(apercu.querySelector("a")?.hasAttribute("href") ?? false).toBe(false);
    expect(fen.querySelector("#todo-description").hidden).toBe(true);
    fen.querySelector('[aria-label="Écrire"]').click();
    expect(document.activeElement).toBe(fen.querySelector("#todo-description"));
  });

  it("les quatre boutons modifient le texte et déclenchent l'enregistrement différé", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a", { description: "mot" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const fen = editeur();
    const d = fen.querySelector("#todo-description");
    d.setSelectionRange(0, 3);
    fen.querySelector('[aria-label="Gras"]').click();
    expect(d.value).toBe("**mot**");
    await vi.advanceTimersByTimeAsync(1600);
    expect(fb.majTodo.mock.calls[0][2]).toEqual({ description: "**mot**" });
  });

  it("le compteur apparaît à partir de 18 000 caractères", async () => {
    const { p } = await monter({ todos: [todo("a", { description: "a".repeat(18_001) })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const c = editeur().querySelector(".todo-editeur-compteur");
    expect(c.hidden).toBe(false);
    expect(c.textContent).toContain("20");
  });
});

describe("todo vidé", () => {
  it("fermer un todo existant vidé propose de le supprimer", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { titre: "t" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const fen = editeur();
    saisir(fen.querySelector("#todo-titre"), "");
    echap(fen);
    await attendre();
    await attendre();
    const dialogue = [...document.querySelectorAll("dialog")].find((d) => d.textContent.includes("Supprimer ce todo vide ?"));
    expect(dialogue).toBeTruthy();
    dialogue.querySelector('[data-valeur="false"]').click();
    await attendre();
    await attendre();
    expect(fb.supprimerTodo).not.toHaveBeenCalled();
    expect(editeur()).toBeNull();
  });
});
