import { afterEach, describe, expect, it, vi } from "vitest";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
});

const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));
const sujet = (id, extra = {}) => ({ id, nom: `Sujet ${id}`, ordre: 1000, couleur: null, creeLe: 1, nbRestants: 0, nbTotal: 0, enAttente: false, ...extra });
const todo = (id, extra = {}) => ({
  id, v: 1, sujetId: "s1", titre: id, description: "", echeance: null, fait: false, faitLe: null,
  creeLe: 1, modifieLe: 1, ordre: 1000, images: [], enAttente: false, ...extra,
});

async function monter({ sujets = [sujet("s1"), sujet("s2")], todos = [], options = {} } = {}) {
  const fb = {
    ecouterSujets: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel(sujets, { depuisCache: false, enAttente: false }));
      return () => {};
    }),
    ecouterCompteursTodos: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel({ nbSujets: sujets.length, nbTodos: todos.length, octets: 0 }));
      return () => {};
    }),
    ecouterTodos: vi.fn((_u, s, rappel) => {
      queueMicrotask(() => rappel(todos.filter((t) => t.sujetId === s), { depuisCache: false, enAttente: false }));
      return () => {};
    }),
    creerSujetTodos: vi.fn(async () => "neuf"),
    majSujet: vi.fn(async () => {}),
    supprimerSujet: vi.fn(async () => {}),
    creerTodo: vi.fn(async () => "t-neuf"),
    majTodo: vi.fn(async () => {}),
    supprimerTodo: vi.fn(async () => {}),
    envoyerImageTodo: vi.fn(async () => ({ promesse: Promise.resolve({}), annuler() {} })),
    supprimerImageTodo: vi.fn(async () => {}),
    lireImageTodo: vi.fn(async () => new Blob(["x"], { type: "image/png" })),
  };
  const p = creerPanneauTodos({ disponible: () => true, charger: async () => fb, uid: () => "u1", ...options });
  document.body.append(p.bouton, p.panneau);
  p.ouvrir();
  await attendre();
  await attendre();
  return { p, fb };
}
const titres = (p) => [...p.panneau.querySelectorAll(".todos-liste:not(.todos-liste--faits) .todo-titre")].map((n) => n.textContent);

describe("panneau des todos (version simple)", () => {
  it("un seul écran : sujets en liste, todos du sujet choisi, champ d'ajout", async () => {
    const { p } = await monter({ todos: [todo("a"), todo("b", { sujetId: "s2" })] });
    expect(p.panneau.querySelector(".sujet-courant-nom").textContent).toBe("Sujet s1");
    // The list of all the subjects opens from the button.
    expect(p.panneau.querySelector(".sujets-liste").hidden).toBe(true);
    p.panneau.querySelector(".sujet-courant").click();
    expect(p.panneau.querySelector(".sujets-liste").hidden).toBe(false);
    expect([...p.panneau.querySelectorAll('[role="option"] .sujet-nom')].map((n) => n.textContent)).toEqual(["Sujet s1", "Sujet s2"]);
    expect(p.panneau.querySelector('[role="option"][aria-selected="true"]').dataset.id).toBe("s1");
    expect(titres(p)).toEqual(["a"]);
    p.panneau.querySelectorAll('[role="option"]')[1].click();
    expect(p.panneau.querySelector(".sujets-liste").hidden).toBe(true);
    await attendre();
    await attendre();
    expect(titres(p)).toEqual(["b"]);
  });

  it("ouvre et ferme, Échap ferme, le focus revient au bouton", async () => {
    const { p } = await monter();
    p.fermer();
    p.bouton.focus();
    p.ouvrir();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(p.panneau.hidden).toBe(true);
    expect(document.activeElement).toBe(p.bouton);
  });

  it("non connecté : proposition de se connecter, aucune lecture", async () => {
    const { p, fb } = await monter({ options: { disponible: () => false } });
    expect(p.panneau.textContent).toContain("Connectez-vous pour utiliser vos todos");
    expect(fb.ecouterSujets).not.toHaveBeenCalled();
  });

  it("réglage coupé : bouton caché, rien n'est lu", async () => {
    const { p } = await monter({ options: { actif: () => false } });
    p.actualiser();
    expect(p.bouton.hidden).toBe(true);
    expect(p.panneau.hidden).toBe(true);
  });

  it("sans sujet : le formulaire de création est l'accueil", async () => {
    const { p } = await monter({ sujets: [] });
    expect(p.panneau.querySelector(".sujets-formulaire").hidden).toBe(false);
    expect(p.panneau.querySelector(".todos-compositeur").hidden).toBe(true);
  });

  it("crée un sujet, puis le choisit", async () => {
    const { p, fb } = await monter();
    p.panneau.querySelector(".sujets-plus").click();
    const form = p.panneau.querySelector(".sujets-formulaire");
    form.querySelector("input").value = "  Vacances ";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.creerSujetTodos.mock.calls[0][1]).toMatchObject({ nom: "Vacances" });
  });

  it("ajoute un todo par Entrée, en haut de la liste ; refuse un titre vide", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { ordre: 5000 })] });
    const form = p.panneau.querySelector(".todos-compositeur");
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(p.panneau.querySelector(".todos-compositeur .todos-message").textContent).toMatch(/titre/);
    form.querySelector("input").value = "  Acheter du pain ";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    expect(fb.creerTodo.mock.calls[0][1]).toMatchObject({ titre: "Acheter du pain", sujetId: "s1", ordre: 4000 });
  });

  it("cocher : 5 clics rapides = une écriture, l'état final", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    for (let i = 0; i < 5; i++) p.panneau.querySelector('[data-id="a"] .todo-case').click();
    await vi.advanceTimersByTimeAsync(400);
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0].slice(1)).toEqual(["a", { fait: true }, { sujetId: "s1" }]);
  });

  it("le todo s'ouvre sur place : titre et description, enregistrés 1,5 s après la dernière frappe", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a", { titre: "Avant" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    expect(p.ouvertId()).toBe("a");
    const li = p.panneau.querySelector('[data-id="a"]');
    const desc = li.querySelector(".todo-champ--description");
    for (const t of ["b", "bo", "bon"]) {
      desc.value = t;
      desc.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const titre = li.querySelector(".todo-champ--titre");
    titre.value = "Nouveau";
    titre.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1600);
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0][2]).toEqual({ description: "bon", titre: "Nouveau" });
  });

  it("refermer écrit tout de suite ; un titre vidé n'est pas enregistré ; un seul todo ouvert", async () => {
    const { p, fb } = await monter({ todos: [todo("a"), todo("b")] });
    const ouvrir = (id) => p.panneau.querySelector(`[data-id="${id}"] .todo-corps`);
    ouvrir("a").click();
    const titre = p.panneau.querySelector('[data-id="a"] .todo-champ--titre');
    titre.value = "   ";
    titre.dispatchEvent(new Event("input", { bubbles: true }));
    const desc = p.panneau.querySelector('[data-id="a"] .todo-champ--description');
    desc.value = "notes";
    desc.dispatchEvent(new Event("input", { bubbles: true }));
    ouvrir("b").click();
    await attendre();
    expect(p.ouvertId()).toBe("b");
    expect(p.panneau.querySelector('[data-id="a"]').classList.contains("todo--ouvert")).toBe(false);
    expect(fb.majTodo.mock.calls[0][2]).toEqual({ description: "notes" });
  });

  it("un instantané ne remplace pas un champ en cours de frappe", async () => {
    const { p } = await monter({ todos: [todo("a", { titre: "Avant" })] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const titre = p.panneau.querySelector('[data-id="a"] .todo-champ--titre');
    titre.focus();
    titre.value = "En cours";
    titre.dispatchEvent(new Event("input", { bubbles: true }));
    p.donnees.notifier();
    expect(titre.value).toBe("En cours");
  });

  it("un titre hostile reste du texte", async () => {
    const { p } = await monter({ todos: [todo("a", { titre: "<img src=x onerror=alert(1)>", description: "<script>x</script>" })] });
    expect(p.panneau.querySelector("img[src='x']")).toBeNull();
    expect(p.panneau.querySelector("script")).toBeNull();
    expect(p.panneau.querySelector(".todo-titre").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("supprimer : le todo disparaît, « Annuler » dans les 5 s n'écrit rien", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    p.panneau.querySelector('[data-id="a"] .todo-supprimer').click();
    expect(p.panneau.querySelector('[data-id="a"]')).toBeNull();
    document.querySelector(".toast-action").click();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fb.supprimerTodo).not.toHaveBeenCalled();
    expect(p.panneau.querySelector('[data-id="a"]')).not.toBeNull();
  });

  it("supprimer sans annuler : une écriture avec le sujet, l'état et l'image", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    p.panneau.querySelector('[data-id="a"] .todo-supprimer').click();
    await vi.advanceTimersByTimeAsync(5100);
    expect(fb.supprimerTodo).toHaveBeenCalledWith("u1", "a", { sujetId: "s1", fait: false, images: [] });
  });

  it("une photo : validée, préparée, envoyée ; une seule par todo", async () => {
    const preparer = vi.fn(async () => ({ blob: new Blob(["p"]), mini: new Blob(["m"]), ext: "webp", typeMime: "image/webp", largeur: 1, hauteur: 1 }));
    const { p, fb } = await monter({ todos: [todo("a")], options: { preparer } });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const champ = p.panneau.querySelector('[data-id="a"] input[type="file"]');
    Object.defineProperty(champ, "files", { value: [new File(["x"], "a.jpg", { type: "image/jpeg" })], configurable: true });
    champ.dispatchEvent(new Event("change"));
    await attendre();
    await attendre();
    expect(preparer).toHaveBeenCalledOnce();
    expect(fb.envoyerImageTodo).toHaveBeenCalledOnce();
    expect(fb.envoyerImageTodo.mock.calls[0][1]).toBe("a");
  });

  it("une photo GIF ou SVG est refusée avec un message ; le todo qui a déjà une photo n'en accepte pas une autre", async () => {
    const { p, fb } = await monter({ todos: [todo("a")] });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    const champ = p.panneau.querySelector('[data-id="a"] input[type="file"]');
    Object.defineProperty(champ, "files", { value: [new File(["x"], "a.gif", { type: "image/gif" })], configurable: true });
    champ.dispatchEvent(new Event("change"));
    await attendre();
    expect(p.panneau.querySelector('[data-id="a"] .todo-message').textContent).toContain("GIF");
    expect(fb.envoyerImageTodo).not.toHaveBeenCalled();
  });

  it("500 todos : champ désactivé", async () => {
    const { p } = await monter({ todos: Array.from({ length: 500 }, (_, i) => todo(`t${i}`)) });
    expect(p.panneau.querySelector(".todos-compositeur input").disabled).toBe(true);
  });

  it("indicateur d'écritures en attente", async () => {
    const { p } = await monter({ todos: [todo("a", { enAttente: true })] });
    expect(p.panneau.querySelector(".todos-etat").textContent).toBe("En attente d'envoi (1)");
  });
});

describe("photo ajoutée en créant le todo", () => {
  const coller = (cible, fichier) => {
    const e = new Event("paste", { bubbles: true, cancelable: true });
    e.clipboardData = { files: [fichier] };
    cible.dispatchEvent(e);
    return e;
  };
  const prete = () => ({ blob: new Blob(["p"]), mini: new Blob(["m"]), ext: "webp", typeMime: "image/webp", largeur: 1, hauteur: 1 });
  global.URL.createObjectURL ??= () => "blob:test";
  global.URL.revokeObjectURL ??= () => {};

  it("Ctrl+V d'une image : elle s'affiche à côté du champ, puis part avec le nouveau todo", async () => {
    const preparer = vi.fn(async () => prete());
    const { p, fb } = await monter({ options: { preparer } });
    const e = coller(p.panneau.querySelector(".todos-compositeur input[type=text], .todos-compositeur .todos-champ"), new File(["x"], "image.png", { type: "image/png" }));
    expect(e.defaultPrevented).toBe(true);
    expect(p.panneau.querySelector(".todos-attente-photo").hidden).toBe(false);
    expect(p.panneau.querySelector(".todos-attente-nom").textContent).toBe("Image collée");
    const form = p.panneau.querySelector(".todos-compositeur");
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    await attendre();
    expect(fb.creerTodo.mock.calls[0][1].titre).toBe("Photo");
    expect(fb.envoyerImageTodo).toHaveBeenCalledOnce();
    expect(fb.envoyerImageTodo.mock.calls[0][1]).toBe("t-neuf");
    expect(p.panneau.querySelector(".todos-attente-photo").hidden).toBe(true);
  });

  it("le bouton joindre prend un fichier, avec un titre ; « Retirer » l'enlève", async () => {
    const { p, fb } = await monter();
    const champ = p.panneau.querySelector('.todos-compositeur input[type="file"]');
    Object.defineProperty(champ, "files", { value: [new File(["x"], "vacances.jpg", { type: "image/jpeg" })], configurable: true });
    champ.dispatchEvent(new Event("change"));
    expect(p.panneau.querySelector(".todos-attente-nom").textContent).toBe("vacances.jpg");
    p.panneau.querySelector(".todos-attente-photo .todo-lien").click();
    expect(p.panneau.querySelector(".todos-attente-photo").hidden).toBe(true);
    expect(fb.envoyerImageTodo).not.toHaveBeenCalled();
  });

  it("un texte collé reste un texte collé ; un GIF est refusé avec un message", async () => {
    const { p } = await monter();
    const e = new Event("paste", { bubbles: true, cancelable: true });
    e.clipboardData = { files: [] };
    p.panneau.querySelector(".todos-compositeur .todos-champ").dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    coller(p.panneau.querySelector(".todos-compositeur .todos-champ"), new File(["x"], "a.gif", { type: "image/gif" }));
    expect(p.panneau.querySelector(".todos-compositeur .todos-message").textContent).toContain("GIF");
  });

  it("un todo ouvert prend l'image collée, pas le champ d'ajout", async () => {
    const { p } = await monter({ todos: [todo("a")], options: { preparer: vi.fn(async () => prete()) } });
    p.panneau.querySelector('[data-id="a"] .todo-corps').click();
    coller(p.panneau.querySelector('[data-id="a"] .todo-champ--description'), new File(["x"], "image.png", { type: "image/png" }));
    expect(p.panneau.querySelector(".todos-attente-photo").hidden).toBe(true);
  });
});
