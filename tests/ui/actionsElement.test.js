import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { exemple } from "../../src/core/exemple.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { brancherActionsElements } from "../../src/ui/actionsElement.js";
import { rendreGrille } from "../../src/ui/grille.js";

vi.mock("../../src/ui/dialogues/dialogueSite.js", () => ({ ouvrirEditionSite: vi.fn() }));

afterEach(() => {
  document.body.replaceChildren();
});

function monter() {
  const store = creerStore({ ...etatInitial(), grille: exemple() }, reduire);
  const ul = document.createElement("ul");
  document.body.append(ul);
  rendreGrille(ul, store.lire().grille);
  store.abonner((e) => rendreGrille(ul, e.grille));
  const actions = brancherActionsElements(store, ul);
  return { store, ul, actions };
}

describe("menu contextuel", () => {
  it("clic droit ouvre le menu, Échap le ferme", () => {
    const { ul } = monter();
    const tuile = ul.querySelector(".tuile");
    tuile.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
    const menu = document.querySelector(".menu");
    expect(menu).not.toBeNull();
    expect([...menu.querySelectorAll("[role=menuitem]")].map((b) => b.textContent)).toEqual([
      "ModifierF2",
      "Ouvrir dans un nouvel onglet",
      "Copier le lien",
      "Déplacer vers…",
      "Créer un dossier avec ce site",
      "Ne pas montrer à l'IA",
      "SupprimerSuppr",
    ]);
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".menu")).toBeNull();
  });
});

describe("suppression", () => {
  it("le toast « Annuler » restaure à la même place", () => {
    const { store, actions } = monter();
    const avant = store.lire();
    const id = avant.grille[2].id;
    actions.supprimer(id);
    expect(store.lire().grille.some((e) => e.id === id)).toBe(false);
    expect(document.querySelector(".toast").textContent).toContain("supprimé");
    document.querySelector(".toast-action").click();
    expect(store.lire()).toEqual(avant);
    expect(document.querySelector(".toast")).toBeNull();
  });
  it("touche Suppr sur une tuile focalisée", () => {
    const { store, ul } = monter();
    const n = store.lire().grille.length;
    ul.querySelector(".tuile").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );
    expect(store.lire().grille).toHaveLength(n - 1);
  });
});

describe("catalogue d'actions (V3.6)", () => {
  const libelles = (entrees) => entrees.filter((e) => e !== "-").map((e) => e.libelle);

  it("« Partager… » n'existe que si le système sait partager", () => {
    const { ul, actions } = monter();
    const id = ul.querySelector(".tuile--site, .tuile:not(.tuile--dossier)").dataset.id;
    expect(libelles(actions.entreesPour(id).entrees)).not.toContain("Partager…");
    navigator.share = vi.fn();
    try {
      expect(libelles(actions.entreesPour(id).entrees)).toContain("Partager…");
    } finally {
      delete navigator.share;
    }
  });

  it("l'appui long ouvre les mêmes actions que le clic droit", () => {
    const largeur = window.innerWidth;
    window.innerWidth = 390; // phone: action sheet
    onTestFinished(() => (window.innerWidth = largeur));
    const { ul, actions } = monter();
    const tuile = ul.querySelector(".tuile:not(.tuile--dossier)");
    const attendu = libelles(actions.entreesPour(tuile.dataset.id).entrees);
    tuile.dispatchEvent(new CustomEvent("appuilong", { bubbles: true }));
    const feuille = document.querySelector(".feuille-actions");
    expect(feuille).not.toBeNull();
    const boutons = [...feuille.querySelectorAll(".feuille-liste .feuille-entree")];
    expect(boutons.map((b) => b.querySelector("span").textContent)).toEqual(attendu);
    expect(feuille.querySelector(".feuille-annuler")).not.toBeNull();
    // A drag starting after the long press closes the sheet.
    tuile.dispatchEvent(new CustomEvent("appuilongannule", { bubbles: true }));
    expect(document.querySelector(".feuille-actions")).toBeNull();
  });
});
