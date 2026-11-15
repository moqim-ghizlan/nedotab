import { afterEach, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { listeEpingles } from "../../src/core/epingles.js";
import { valider } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerEpingles } from "../../src/ui/epingles.js";
import { rendreGrille } from "../../src/ui/grille.js";

afterEach(() => document.body.replaceChildren());

const site = (id, extra = {}) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, icone: { type: "lettre", couleur: "#369" }, creeLe: 1, ...extra });
const dossier = (id, items = []) => ({ id, type: "dossier", titre: id, items, creeLe: 1 });
const magasin = (grille) => creerStore({ ...etatInitial(), grille }, reduire, { geler: false });

describe("actions d'épinglage", () => {
  it("épingle, ordonne, désépingle sans jamais déplacer l'élément", () => {
    const store = magasin([site("a"), dossier("d", [site("b")]), site("e")]);
    for (const id of ["a", "b", "d"]) store.envoyer({ type: A.EPINGLER, id });
    expect(listeEpingles(store.lire().grille).map((x) => x.element.id)).toEqual(["a", "b", "d"]);
    store.envoyer({ type: A.EPINGLE_DEPLACER, id: "d", versIndex: 0 });
    expect(listeEpingles(store.lire().grille).map((x) => x.element.id)).toEqual(["d", "a", "b"]);
    store.envoyer({ type: A.DESEPINGLER, id: "a" });
    expect(store.lire().grille.map((e) => e.id)).toEqual(["a", "d", "e"]);
    expect(store.lire().grille[0].epingleAccueil).toBeUndefined();
  });

  it("le 11e est refusé", () => {
    const store = magasin(Array.from({ length: 11 }, (_, i) => site(`s${i}`)));
    for (let i = 0; i < 11; i++) store.envoyer({ type: A.EPINGLER, id: `s${i}` });
    expect(listeEpingles(store.lire().grille)).toHaveLength(10);
  });

  it("la migration rend les épingles valides", () => {
    const etat = valider({ grille: [site("a", { epingleAccueil: 4 }), site("b", { epingleAccueil: "x" })], reglages: {} }, vi.fn(), vi.fn());
    expect(etat.grille[0].epingleAccueil).toBe(1);
    expect(etat.grille[1].epingleAccueil).toBeUndefined();
  });
});

describe("grille", () => {
  it("montre toujours un élément épinglé dans la grille", () => {
    const ul = document.createElement("ul");
    rendreGrille(ul, [site("a"), site("b", { epingleAccueil: 1 })]);
    const cases = [...ul.querySelectorAll(".case--element")];
    expect(cases).toHaveLength(2);
    expect(cases[1].hidden).toBe(false);
    expect(cases[0].hidden).toBe(false);
  });
});

describe("liste des épingles", () => {
  const monter = (grille, reglages = {}) => {
    const store = creerStore({ ...etatInitial(), grille, reglages: { ...etatInitial().reglages, ...reglages } }, reduire, { geler: false });
    const ouvrirDossier = vi.fn();
    const ui = creerEpingles({ store, ouvrirDossier });
    document.body.append(ui.racine);
    return { store, ui, ouvrirDossier };
  };

  it("est cachée sans épingle, puis affiche les éléments dans l'ordre", () => {
    const { store, ui } = monter([site("a"), dossier("d", [site("b")])]);
    expect(ui.racine.hidden).toBe(true);
    store.envoyer({ type: A.EPINGLER, id: "d" });
    store.envoyer({ type: A.EPINGLER, id: "a" });
    expect(ui.racine.hidden).toBe(false);
    expect([...ui.racine.querySelectorAll(".epingle")].map((l) => l.dataset.id)).toEqual(["d", "a"]);
  });

  it("met le titre en texte, jamais en HTML", () => {
    const { ui } = monter([site("a", { titre: "<img src=x onerror=alert(1)>", epingleAccueil: 1 })]);
    expect(ui.racine.querySelector("img[src='x']")).toBeNull();
    expect(ui.racine.querySelector(".epingle-titre").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("un clic sur un dossier épinglé l'ouvre", () => {
    const { ui, ouvrirDossier } = monter([{ ...dossier("d"), epingleAccueil: 1 }]);
    ui.racine.querySelector(".epingle-lien").click();
    expect(ouvrirDossier).toHaveBeenCalledWith("d", expect.any(HTMLElement));
  });

  it("le bouton désépingler retire l'élément de la liste", () => {
    vi.useFakeTimers();
    const { store, ui } = monter([site("a", { epingleAccueil: 1 })]);
    ui.racine.querySelector("[data-desepingler]").click();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(listeEpingles(store.lire().grille)).toHaveLength(0);
    expect(ui.racine.hidden).toBe(true);
  });

  it("se cache quand le réglage est désactivé, sans perdre les épingles", () => {
    const { store, ui } = monter([site("a", { epingleAccueil: 1 })], { sansEpingles: true });
    expect(ui.racine.hidden).toBe(true);
    expect(listeEpingles(store.lire().grille)).toHaveLength(1);
  });

  it("la poignée déplace avec les flèches", () => {
    const { store, ui } = monter([site("a", { epingleAccueil: 1 }), site("b", { epingleAccueil: 2 })]);
    const poignee = ui.racine.querySelector('[data-poignee="b"]');
    poignee.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    expect(listeEpingles(store.lire().grille).map((x) => x.element.id)).toEqual(["b", "a"]);
  });
});
