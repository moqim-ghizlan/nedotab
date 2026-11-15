import { pistesDe } from "../../src/core/pistes.js";
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
const todo = (id, extra = {}) => {
  const t = {
    id, v: 1, sujetId: "s1", titre: id, description: "", echeance: null, fait: false, faitLe: null,
    creeLe: 1, modifieLe: 1, ordre: 1000, images: [], enAttente: false, ...extra,
  };
  // As lireTodo gives it: an old todo is read as a todo with one piste.
  return { ...t, pistes: extra.pistes ?? pistesDe(t) };
};

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
    deplacerTodo: vi.fn(async () => {}),
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
/** The actions of a todo are behind "⋯": open it and choose an entry. */
async function menuTodo(m, libelle) {
  m.querySelector(".modale-todo-plus").click();
  [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent.includes(libelle)).click();
  await attendre();
}
const fenetre = () => document.querySelector(".modale-todo[open]");
async function ouvrirTodo(p, id) {
  p.panneau.querySelector(`[data-id="${id}"] .todo-corps`).click();
  await attendre();
  return fenetre();
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

  it("« Nouveau todo » ouvre la fenêtre ; refuse un titre vide, puis ajoute en haut de la liste", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { ordre: 5000 })] });
    p.panneau.querySelector(".todos-ajouter").click();
    const m = fenetre();
    expect(m.getAttribute("aria-modal")).toBe("true");
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(m.querySelector(".modale-todo-message").textContent).toMatch(/titre/);
    m.querySelector(".todo-champ--titre").value = "  Acheter du pain ";
    m.querySelector(".modale-piste-description").value = "chez Paul";
    m.querySelector(".modale-piste-description").dispatchEvent(new Event("input"));
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.creerTodo.mock.calls[0][1]).toMatchObject({ titre: "Acheter du pain", sujetId: "s1", ordre: 4000, v: 2, pistes: [expect.objectContaining({ description: "chez Paul" })] });
    expect(fenetre()).toBeNull();
  });

  it("cocher : 5 clics rapides = une écriture, l'état final", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    for (let i = 0; i < 5; i++) p.panneau.querySelector('[data-id="a"] .todo-case').click();
    await vi.advanceTimersByTimeAsync(400);
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0].slice(1)).toEqual(["a", { fait: true }, { sujetId: "s1" }]);
  });

  it("un todo s'ouvre dans la fenêtre ; Enregistrer n'écrit que ce qui a changé", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { titre: "Avant", description: "x" })] });
    const m = await ouvrirTodo(p, "a");
    expect(m.querySelector(".todo-champ--titre").value).toBe("Avant");
    m.querySelector(".modale-piste-description").value = "bon";
    m.querySelector(".modale-piste-description").dispatchEvent(new Event("input"));
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.majTodo).toHaveBeenCalledOnce();
    expect(fb.majTodo.mock.calls[0][2]).toEqual({ pistes: [{ id: "principale", titre: "", description: "bon", imageId: null }] });
    expect(fenetre()).toBeNull();
  });

  it("Annuler et Échap n'écrivent rien ; un titre vidé est refusé", async () => {
    const { p, fb } = await monter({ todos: [todo("a")] });
    let m = await ouvrirTodo(p, "a");
    m.querySelector(".todo-champ--titre").value = "autre";
    m.querySelector('button[aria-label="Annuler"]').click();
    expect(fenetre()).toBeNull();
    m = await ouvrirTodo(p, "a");
    m.querySelector(".todo-champ--titre").value = "   ";
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(m.querySelector(".modale-todo-message").textContent).toMatch(/vide/);
    m.close();
    expect(fb.majTodo).not.toHaveBeenCalled();
  });

  it("le bouton Supprimer du pied : icône en danger, confirmation d'abord", async () => {
    const { p } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    const b = m.querySelector(".modale-todo-pied .modale-todo-icone--danger");
    expect(b.getAttribute("aria-label")).toBe("Supprimer le todo");
    b.click();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(p.panneau.querySelector('[data-id="a"]')).not.toBeNull();
  });

  it("« Fait » : enregistre et coche le todo ; sur un todo fait il le rouvre ; absent à la création", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a", { titre: "Avant" })] });
    const m = await ouvrirTodo(p, "a");
    m.querySelector(".todo-champ--titre").value = "Après";
    const bouton = m.querySelector(".modale-todo-icone--fait");
    expect(bouton.getAttribute("aria-label")).toBe("Marquer comme fait");
    bouton.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(fb.majTodo.mock.calls.map((c) => c[2])).toEqual([{ titre: "Après" }, { fait: true }]);
    p.panneau.querySelector(".todos-ajouter").click();
    expect(fenetre().querySelector(".modale-todo-icone--fait")).toBeNull();
  });

  it("un titre hostile reste du texte", async () => {
    const { p } = await monter({ todos: [todo("a", { titre: "<img src=x onerror=alert(1)>", description: "<script>x</script>" })] });
    expect(p.panneau.querySelector("img[src='x']")).toBeNull();
    expect(p.panneau.querySelector("script")).toBeNull();
    expect(p.panneau.querySelector(".todo-titre").textContent).toBe("<img src=x onerror=alert(1)>");
    const m = await ouvrirTodo(p, "a");
    expect(m.querySelector("img[src='x']")).toBeNull();
    expect(m.querySelector(".modale-piste-description").value).toBe("<script>x</script>");
  });

  it("pistes : ajouter une piste (5 au plus), remplir, enregistrer en v2", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { titre: "Plan" })] });
    const m = await ouvrirTodo(p, "a");
    expect(m.querySelectorAll(".modale-piste")).toHaveLength(0);
    const ajout = m.querySelector(".modale-pistes-ajout");
    ajout.click();
    expect(m.querySelectorAll(".modale-piste")).toHaveLength(1);
    const piste = m.querySelector(".modale-piste");
    piste.querySelector(".modale-piste-titre").value = "Étape 1";
    piste.querySelector(".modale-piste-titre").dispatchEvent(new Event("input"));
    piste.querySelector(".modale-piste-description").value = "faire ceci";
    piste.querySelector(".modale-piste-description").dispatchEvent(new Event("input"));
    for (let i = 0; i < 6; i++) ajout.click();
    expect(m.querySelectorAll(".modale-piste")).toHaveLength(5);
    expect(ajout.disabled).toBe(true);
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    const champs = fb.majTodo.mock.calls[0][2];
    expect(champs.pistes).toHaveLength(1); // the empty pistes are left out
    expect(champs.pistes[0]).toMatchObject({ titre: "Étape 1", description: "faire ceci", imageId: null });
  });

  it("pistes : un ancien todo montre sa piste et ne s'écrit pas s'il n'est pas modifié", async () => {
    const { p, fb } = await monter({ todos: [todo("a", { titre: "Vieux", description: "texte ancien" })] });
    const m = await ouvrirTodo(p, "a");
    expect(m.querySelectorAll(".modale-piste")).toHaveLength(1);
    expect(m.querySelector(".modale-piste-description").value).toBe("texte ancien");
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.majTodo).not.toHaveBeenCalled();
  });

  it("pistes : la liste annonce le nombre de pistes", async () => {
    const pistes = [{ id: "p1", titre: "A", description: "", imageId: null }, { id: "p2", titre: "B", description: "", imageId: null }];
    const { p } = await monter({ todos: [todo("a", { v: 2, pistes })] });
    expect(p.panneau.querySelector('[data-id="a"]').textContent).toContain("2 pistes");
  });

  it("supprimer : confirmation d'abord (Annuler a le focus), puis le todo disparaît, « Annuler » dans les 5 s n'écrit rien", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    await menuTodo(m, "Supprimer le todo");
    const conf = document.querySelector('[role="alertdialog"]');
    expect(conf.textContent).toContain("irréversible");
    expect(p.panneau.querySelector('[data-id="a"]')).not.toBeNull(); // nothing yet
    expect(document.activeElement.textContent).toBe("Annuler");
    [...conf.querySelectorAll("button")].find((b) => b.textContent === "Supprimer").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.panneau.querySelector('[data-id="a"]')).toBeNull();
    document.querySelector(".toast-action").click();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fb.supprimerTodo).not.toHaveBeenCalled();
    expect(p.panneau.querySelector('[data-id="a"]')).not.toBeNull();
  });

  it("refuser la confirmation ne supprime rien", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    await menuTodo(m, "Supprimer le todo");
    [...document.querySelector('[role="alertdialog"]').querySelectorAll("button")].find((b) => b.textContent === "Annuler").click();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fb.supprimerTodo).not.toHaveBeenCalled();
    expect(p.panneau.querySelector('[data-id="a"]')).not.toBeNull();
  });

  it("supprimer sans annuler : une écriture avec le sujet, l'état et l'image", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    await menuTodo(m, "Supprimer le todo");
    [...document.querySelector('[role="alertdialog"]').querySelectorAll("button")].find((b) => b.textContent === "Supprimer").click();
    await vi.advanceTimersByTimeAsync(5100);
    expect(fb.supprimerTodo).toHaveBeenCalledOnce();
    expect(fb.supprimerTodo).toHaveBeenCalledWith("u1", "a", { sujetId: "s1", fait: false, images: [] });
  });

  it("une photo : validée, préparée, envoyée à l'enregistrement", async () => {
    const preparer = vi.fn(async () => prete());
    const { p, fb } = await monter({ todos: [todo("a")], options: { preparer } });
    const m = await ouvrirTodo(p, "a");
    choisir(m, new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(fb.envoyerImageTodo).not.toHaveBeenCalled(); // nothing before « Enregistrer »
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    await attendre();
    expect(preparer).toHaveBeenCalledOnce();
    expect(fb.envoyerImageTodo).toHaveBeenCalledOnce();
    expect(fb.envoyerImageTodo.mock.calls[0][1]).toBe("a");
  });

  it("une photo GIF ou SVG est refusée avec un message", async () => {
    const { p, fb } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    choisir(m, new File(["x"], "a.gif", { type: "image/gif" }));
    expect(m.querySelector(".modale-todo-message").textContent).toContain("GIF");
    expect(fb.envoyerImageTodo).not.toHaveBeenCalled();
  });

  it("500 todos : bouton désactivé", async () => {
    const { p } = await monter({ todos: Array.from({ length: 500 }, (_, i) => todo(`t${i}`)) });
    expect(p.panneau.querySelector(".todos-ajouter").disabled).toBe(true);
  });

  it("l'attente d'envoi ne s'affiche pas tout de suite, seulement si elle dure", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { p } = await monter({ todos: [todo("a", { enAttente: true })] });
    const note = p.panneau.querySelector(".todos-etat");
    expect(note.textContent).toBe("");
    await vi.advanceTimersByTimeAsync(5200);
    expect(note.textContent).toBe("Envoi en cours (1)");
  });
});

const prete = () => ({ blob: new Blob(["p"]), mini: new Blob(["m"]), ext: "webp", typeMime: "image/webp", largeur: 1, hauteur: 1 });
global.URL.createObjectURL ??= () => "blob:test";
global.URL.revokeObjectURL ??= () => {};
const choisir = (m, f) => {
  const champ = m.querySelector('input[type="file"]');
  Object.defineProperty(champ, "files", { value: [f], configurable: true });
  champ.dispatchEvent(new Event("change"));
};

describe("image ajoutée en créant le todo", () => {
  const coller = (cible, fichier) => {
    const e = new Event("paste", { bubbles: true, cancelable: true });
    e.clipboardData = { files: [fichier] };
    cible.dispatchEvent(e);
    return e;
  };

  it("Ctrl+V d'une image sur le panneau ouvre la fenêtre avec l'image, qui part avec le nouveau todo", async () => {
    const preparer = vi.fn(async () => prete());
    const { p, fb } = await monter({ options: { preparer } });
    const e = coller(p.panneau.querySelector(".todos-corps"), new File(["x"], "image.png", { type: "image/png" }));
    expect(e.defaultPrevented).toBe(true);
    const m = fenetre();
    expect(m.querySelector(".modale-todo-nom").textContent).toBe("Image collée");
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    await attendre();
    expect(fb.creerTodo.mock.calls[0][1].titre).toBe("Photo");
    expect(fb.envoyerImageTodo).toHaveBeenCalledOnce();
    expect(fb.envoyerImageTodo.mock.calls[0][1]).toBe("t-neuf");
  });

  it("un nom de fichier très long : le nom se raccourcit, le bouton Retirer reste là et fonctionne", async () => {
    const { p, fb } = await monter();
    p.panneau.querySelector(".todos-ajouter").click();
    const m = fenetre();
    const nom = `${"4e13be43-4ae9-4e8f-9897-".repeat(8)}.webp`;
    choisir(m, new File(["x"], nom, { type: "image/webp" }));
    const nomEl = m.querySelector(".modale-todo-nom");
    expect(nomEl.textContent).toBe(nom);
    expect(nomEl.getAttribute("title")).toBe(nom);
    const retirer = m.querySelector(".modale-todo-retirer");
    expect(retirer.getAttribute("aria-label")).toBe("Retirer l'image");
    retirer.click();
    await attendre();
    expect(m.querySelector(".modale-todo-image")).toBeNull();
    expect(fb.envoyerImageTodo).not.toHaveBeenCalled();
  });

  it("un texte collé reste un texte collé", async () => {
    const { p } = await monter();
    const e = new Event("paste", { bubbles: true, cancelable: true });
    e.clipboardData = { files: [] };
    p.panneau.querySelector(".todos-corps").dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(fenetre()).toBeNull();
  });
});

describe("changer le sujet d'un todo", () => {
  it("la liste propose tous les sujets ; un autre sujet déplace le todo (un lot, deux compteurs)", async () => {
    const { p, fb } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    const choix = m.querySelector(".todo-champ--sujet");
    expect([...choix.options].map((o) => o.textContent)).toEqual(["Sujet s1", "Sujet s2"]);
    expect(choix.value).toBe("s1");
    choix.value = "s2";
    m.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.deplacerTodo).toHaveBeenCalledOnce();
    expect(fb.deplacerTodo.mock.calls[0][2]).toMatchObject({ depuis: "s1", vers: "s2", fait: false });
  });
  it("les actions sont dans un menu « ⋯ » : télécharger .md, .pdf, supprimer ; les boutons du bas sont des icônes", async () => {
    const { p } = await monter({ todos: [todo("a")] });
    const m = await ouvrirTodo(p, "a");
    m.querySelector(".modale-todo-plus").click();
    const entrees = [...document.querySelectorAll(".menu-entree")].map((b) => b.textContent);
    expect(entrees.some((e) => e.includes(".md"))).toBe(true);
    expect(entrees.some((e) => e.includes("PDF"))).toBe(true);
    expect(document.querySelector(".menu-entree--danger").textContent).toContain("Supprimer");
    const pied = [...m.querySelectorAll(".modale-todo-pied button")];
    expect(pied.map((b) => b.textContent)).toEqual(["", "", "", ""]);
    expect(pied.every((b) => b.getAttribute("aria-label") && b.querySelector("svg"))).toBe(true);
  });
  it("les dates : créé et appareil ; « Modifié » seulement s'il apporte quelque chose", async () => {
    const t0 = new Date(2026, 10, 6, 21, 31).getTime();
    const a = await monter({ todos: [todo("a", { creeLe: t0, modifieLe: t0 + 5000, appareil: "Pc-lyon" })] });
    const texte = (await ouvrirTodo(a.p, "a")).querySelector(".todo-dates").textContent;
    expect(texte).toContain("Créé 6 nov. 2026");
    expect(texte).toContain("Pc-lyon");
    expect(texte).not.toContain("Modifié");
    document.body.replaceChildren();
    const b = await monter({ todos: [todo("a", { creeLe: t0, modifieLe: t0 + 3_600_000 })] });
    expect((await ouvrirTodo(b.p, "a")).querySelector(".todo-dates").textContent).toContain("Modifié");
  });
});

describe("suppressions interrompues par un rechargement", () => {
  it("un sujet supprimé puis la page rechargée avant 5 s est supprimé au démarrage suivant", async () => {
    const a = await monter({ sujets: [sujet("s1")] });
    // The subject is removed ("Sujet supprimé", 5 s to cancel) ...
    a.p.donnees.supprimerSujet("s1");
    expect(JSON.parse(localStorage.getItem("nedotab:todos:suppressions"))).toMatchObject([{ type: "sujet", id: "s1", uid: "u1" }]);
    // ... and the page is reloaded at once: a new start finishes the job.
    document.body.replaceChildren();
    const b = await monter({ sujets: [sujet("s1")] });
    await attendre();
    expect(b.fb.supprimerSujet).toHaveBeenCalledWith("u1", "s1");
    expect(localStorage.getItem("nedotab:todos:suppressions")).toBeNull();
  });
  it("annuler oublie la suppression", async () => {
    const a = await monter({ sujets: [sujet("s1")] });
    a.p.donnees.supprimerSujet("s1").annuler();
    expect(localStorage.getItem("nedotab:todos:suppressions")).toBeNull();
  });
  it("une suppression qui échoue le dit et garde l'élément", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const a = await monter({ sujets: [sujet("s1")] });
    a.fb.supprimerSujet.mockRejectedValueOnce(new Error("refusé"));
    a.p.donnees.supprimerSujet("s1");
    await vi.advanceTimersByTimeAsync(5100);
    expect(document.querySelector(".toast").textContent).toContain("La suppression a échoué");
    expect(a.p.donnees.etat().sujets).toHaveLength(1);
  });
});

describe("télécharger un todo en .md", () => {
  it("sans image : un fichier .md au nom du titre", async () => {
    const sauve = [];
    const { enregistrerFichier } = await import("../../src/ui/copierImage.js");
    void enregistrerFichier;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => (sauve.push(b), "blob:x");
    const { p } = await monter({ todos: [todo("a", { titre: "Acheter: du pain" })] });
    const m = await ouvrirTodo(p, "a");
    await menuTodo(m, "Télécharger en Markdown (.md)");
    await attendre();
    await attendre();
    URL.createObjectURL = orig;
    expect(sauve).toHaveLength(1);
    expect(sauve[0].name).toBe("Acheter du pain.md");
    expect(await sauve[0].text()).toContain("# Acheter: du pain");
  });
  it("avec image : une archive .zip", async () => {
    const sauve = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => (sauve.push(b), "blob:x");
    const t = todo("a", { titre: "Photo", images: [{ id: "i", chemin: "todos/u1/a/i.webp", typeMime: "image/webp", taille: 1 }] });
    const { p, fb } = await monter({ todos: [t] });
    const m = await ouvrirTodo(p, "a");
    await menuTodo(m, "Télécharger en Markdown (.md)");
    await attendre();
    await attendre();
    await attendre();
    URL.createObjectURL = orig;
    const fichier = sauve.find((b) => b.name === "Photo.zip");
    expect(fichier).toBeTruthy();
    expect(fb.lireImageTodo).toHaveBeenCalledWith("todos/u1/a/i.webp");
  });
});
