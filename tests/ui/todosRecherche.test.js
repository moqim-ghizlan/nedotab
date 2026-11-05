// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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
  nom: `Sujet ${id}`,
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
const jour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const decale = (n, base = new Date()) => jour(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n));

async function monter({ todos = [], aujourdhui = [], retard = 0, tous = [], sujets = [sujet("s1"), sujet("s2")] } = {}) {
  const fb = {
    ecouterSujets: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel(sujets, { depuisCache: false, enAttente: false }));
      return () => {};
    }),
    ecouterCompteursTodos: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel({ nbSujets: 2, nbTodos: todos.length, octets: 0 }));
      return () => {};
    }),
    ecouterTodos: vi.fn((_u, _s, rappel) => {
      queueMicrotask(() => rappel(todos, { depuisCache: false, enAttente: false, plein: false }));
      return () => {};
    }),
    ecouterAujourdhui: vi.fn((_u, fin, rappel) => {
      queueMicrotask(() => rappel(aujourdhui, { depuisCache: false, plein: false }));
      return () => {};
    }),
    compterEnRetardTodos: vi.fn(async () => retard),
    lirePageTousLesTodos: vi.fn(async () => ({ todos: tous, plein: false })),
    majTodo: vi.fn(async () => {}),
    creerTodoAvecId: vi.fn(async () => ({ ok: true })),
    nouvelIdTodo: vi.fn(() => "neuf"),
    creerTodo: vi.fn(async () => {}),
  };
  const p = creerPanneauTodos({ disponible: () => true, charger: async () => fb, uid: () => "u1" });
  document.body.append(p.bouton, p.panneau);
  p.actualiser();
  await attendre();
  await attendre();
  return { p, fb };
}
const ouvrirSujet = async (p) => {
  p.ouvrir();
  await attendre();
  await attendre();
  p.ouvrirSujet("s1");
  await attendre();
  await attendre();
};
const titres = (p) => [...p.panneau.querySelectorAll(".todo-ligne .todo-titre")].map((n) => n.textContent);

describe("recherche dans un sujet", () => {
  const todos = [
    todo("a", { titre: "Éclair au chocolat", ordre: 1 }),
    todo("b", { titre: "Appeler le garage", description: "pour le **pneu**", ordre: 2 }),
    todo("c", { titre: "Acheter du pain", ordre: 3 }),
  ];
  it("est différée de 150 ms, sans accents ni casse, sur le titre et la description", async () => {
    const { p } = await monter({ todos });
    await ouvrirSujet(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const champ = p.panneau.querySelector(".todos-recherche");
    champ.value = "ECLAIR";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    expect(titres(p)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(160);
    expect(titres(p)).toEqual(["Éclair au chocolat"]);
    champ.value = "pneu";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(160);
    expect(titres(p)).toEqual(["Appeler le garage"]);
  });
  it("surligne avec des nœuds mark, jamais du HTML", async () => {
    const { p } = await monter({ todos: [todo("a", { titre: "<b>gras</b> pain" })] });
    await ouvrirSujet(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const champ = p.panneau.querySelector(".todos-recherche");
    champ.value = "pain";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(160);
    expect(p.panneau.querySelector(".todo-titre mark").textContent).toBe("pain");
    expect(p.panneau.querySelector(".todo-titre b")).toBeNull();
    expect(p.panneau.querySelector(".todo-titre").textContent).toBe("<b>gras</b> pain");
  });
  it("aucun résultat : message", async () => {
    const { p } = await monter({ todos });
    await ouvrirSujet(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const champ = p.panneau.querySelector(".todos-recherche");
    champ.value = "zzzz";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(160);
    expect(p.panneau.textContent).toContain("Aucun todo ne correspond.");
  });
  it("Échap vide la recherche avant de fermer le panneau", async () => {
    const { p } = await monter({ todos });
    await ouvrirSujet(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const champ = p.panneau.querySelector(".todos-recherche");
    champ.value = "pain";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(160);
    champ.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(10);
    expect(champ.value).toBe("");
    expect(titres(p)).toHaveLength(3);
    expect(p.panneau.hidden).toBe(false);
  });
});

describe("filtres et tris", () => {
  const hier = decale(-1);
  const todos = [
    todo("a", { echeance: hier, ordre: 1 }),
    todo("b", { echeance: decale(5), ordre: 2 }),
    todo("c", { fait: true, echeance: hier, ordre: 3 }),
    todo("d", { ordre: 4 }),
  ];
  const choisir = async (p, bouton, libelle) => {
    p.panneau.querySelectorAll(".todos-menu-bouton")[bouton].click();
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent.replace("✓ ", "") === libelle).click();
    await attendre();
  };
  it("En retard, Sans échéance, Faits", async () => {
    const { p } = await monter({ todos });
    await ouvrirSujet(p);
    await choisir(p, 0, "En retard");
    expect(titres(p)).toEqual(["a"]);
    await choisir(p, 0, "Sans échéance");
    expect(titres(p)).toEqual(["d"]);
    await choisir(p, 0, "Faits");
    expect(p.panneau.querySelectorAll(".todos-liste--faits .todo-ligne")).toHaveLength(1);
  });
  it("tri par échéance : sans date en dernier, poignées masquées", async () => {
    const { p } = await monter({ todos: todos.filter((t) => !t.fait) });
    await ouvrirSujet(p);
    await choisir(p, 1, "Échéance");
    expect(titres(p)).toEqual(["a", "b", "d"]);
    expect(p.panneau.querySelector(".todos-vue--libre")).not.toBeNull();
  });
  it("la pastille d'un todo en retard dit « En retard de 1 jour » en toutes lettres", async () => {
    const { p } = await monter({ todos });
    await ouvrirSujet(p);
    const pastille = p.panneau.querySelector('[data-id="a"] .todo-date');
    expect(pastille.textContent).toContain("Hier");
    expect(pastille.dataset.statut).toBe("retard");
    expect(pastille.querySelector("svg")).not.toBeNull();
  });
  it("« Tous les sujets » charge 100 todos à la demande et les cherche avec leur sujet", async () => {
    const { p, fb } = await monter({ todos: [], tous: [todo("z", { titre: "Pain complet", sujetId: "s2" })] });
    await ouvrirSujet(p);
    expect(fb.lirePageTousLesTodos).not.toHaveBeenCalled();
    p.panneau.querySelector(".todos-menu-bouton--portee").click();
    await attendre();
    await attendre();
    expect(fb.lirePageTousLesTodos).toHaveBeenCalledOnce();
    const ligne = p.panneau.querySelector(".todos-liste--tous .todo-ligne");
    expect(ligne.querySelector(".todo-titre").textContent).toBe("Pain complet");
    expect(ligne.querySelector(".todo-sujet-nom").textContent).toBe("Sujet s2");
  });
});

describe("vue « Aujourd'hui » et pastille", () => {
  it("regroupe par urgence avec le sujet de chaque todo et des compteurs", async () => {
    const { p, fb } = await monter({
      aujourdhui: [
        todo("r", { echeance: decale(-3), sujetId: "s1" }),
        todo("j", { echeance: decale(0), sujetId: "s2" }),
        todo("d", { echeance: decale(1), sujetId: "s2" }),
      ],
    });
    p.ouvrir();
    await attendre();
    p.panneau.querySelector("#todos-onglet-aujourdhui").click();
    await attendre();
    await attendre();
    expect(fb.ecouterAujourdhui).toHaveBeenCalledOnce();
    const titresGroupes = [...p.panneau.querySelectorAll(".todos-groupe:not([hidden]) .todos-groupe-titre")].map((n) => n.textContent);
    expect(titresGroupes.slice(0, 3)).toEqual(["En retard (1)", "Aujourd'hui (1)", "Demain (1)"]);
    expect(p.panneau.querySelector('[data-id="r"] .todo-sujet-nom').textContent).toBe("Sujet s1");
    expect(p.panneau.querySelector('[data-id="r"] .todo-date').textContent).toContain("En retard de 3 jours");
  });
  it("vide : « Rien d'urgent. Profitez-en. » ; quitter l'onglet détache l'écouteur", async () => {
    const arret = vi.fn();
    const { p, fb } = await monter({ aujourdhui: [] });
    fb.ecouterAujourdhui.mockImplementation((_u, _f, rappel) => {
      queueMicrotask(() => rappel([], { plein: false }));
      return arret;
    });
    p.ouvrir();
    p.panneau.querySelector("#todos-onglet-aujourdhui").click();
    await attendre();
    await attendre();
    expect(p.panneau.textContent).toContain("Rien d'urgent. Profitez-en.");
    p.panneau.querySelector("#todos-onglet-sujets").click();
    expect(arret).toHaveBeenCalled();
  });
  it("la pastille du bouton affiche le nombre en retard", async () => {
    const { p, fb } = await monter({ retard: 3 });
    expect(fb.compterEnRetardTodos).toHaveBeenCalledWith("u1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(p.bouton.querySelector(".todos-pastille").hidden).toBe(false);
    expect(p.bouton.querySelector(".todos-pastille").textContent).toBe("3");
    expect(p.bouton.getAttribute("aria-label")).toBe("Ouvrir les todos, 3 en retard");
  });
  it("sans retard : pas de pastille", async () => {
    const { p } = await monter({ retard: 0 });
    expect(p.bouton.querySelector(".todos-pastille").hidden).toBe(true);
  });
  it("à minuit les libellés changent sans recharger", async () => {
    const veille = new Date(2026, 10, 5, 23, 59, 30);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(veille);
    const { p } = await monter({ todos: [todo("a", { echeance: "2026-11-06" })] });
    p.ouvrir();
    await vi.advanceTimersByTimeAsync(5);
    p.ouvrirSujet("s1");
    await vi.advanceTimersByTimeAsync(5);
    expect(p.panneau.querySelector('[data-id="a"] .todo-date').textContent).toContain("Demain");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(p.panneau.querySelector('[data-id="a"] .todo-date').textContent).toContain("Aujourd'hui");
  });
});

describe("échéances rapides de l'éditeur", () => {
  it("Aujourd'hui, Demain, Semaine prochaine, Effacer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.ouvrir();
    await vi.advanceTimersByTimeAsync(5);
    p.ouvrirSujet("s1");
    await vi.advanceTimersByTimeAsync(5);
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const fen = document.querySelector(".todo-editeur");
    const bouton = (t) => [...fen.querySelectorAll(".todo-rapide")].find((b) => b.textContent === t);
    bouton("Demain").click();
    await vi.advanceTimersByTimeAsync(5);
    expect(fb.majTodo.mock.calls.at(-1)[2]).toEqual({ echeance: decale(1) });
    expect(fen.querySelector("#todo-echeance").value).toBe(decale(1));
    bouton("Effacer").click();
    await vi.advanceTimersByTimeAsync(5);
    expect(fb.majTodo.mock.calls.at(-1)[2]).toEqual({ echeance: null });
    expect(fen.querySelector("#todo-echeance").value).toBe("");
  });
});

describe("index Firestore", () => {
  it("la requête de la vue « Aujourd'hui » a son index (fait, echeance)", () => {
    const { indexes } = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
    const present = indexes.some(
      (i) =>
        i.collectionGroup === "todos" &&
        i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(",") === "fait:ASCENDING,echeance:ASCENDING",
    );
    expect(present).toBe(true);
    const source = readFileSync("src/firebase/todos.js", "utf8");
    expect(source).toContain('where("fait", "==", false)');
    expect(source).toContain('where("echeance", "<=", finSemaine)');
    expect(source).toContain('orderBy("echeance")');
  });
});
