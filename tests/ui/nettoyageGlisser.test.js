import { afterEach, describe, expect, it, vi } from "vitest";
import { creerStore } from "../../src/core/store.js";
import { reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { activerGlisser } from "../../src/ui/glisser.js";
import { nettoyerGlisser } from "../../src/ui/nettoyageGlisser.js";

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = "";
});

function grilleAvecFantome() {
  const grille = document.createElement("div");
  grille.innerHTML = '<div class="case case--element case--fantome case--choisie" style="opacity:0.4;transform:translate(3px,4px)"><div class="tuile" data-id="a"></div></div><div class="case case--element"><div class="tuile" data-id="b"></div></div>';
  const copie = document.createElement("div");
  copie.className = "case case--element sortable-fallback case--glissee";
  document.body.append(grille, copie);
  document.body.classList.add("glisser-en-cours");
  return { grille, copie };
}

describe("nettoyage après un glisser interrompu (TODO 14)", () => {
  it("retire la copie orpheline, les classes fantôme / choisie et les styles en ligne", () => {
    const { grille, copie } = grilleAvecFantome();
    expect(nettoyerGlisser()).toBe(1);
    expect(copie.isConnected).toBe(false);
    const a = grille.querySelector('[data-id="a"]').parentElement;
    expect(a.className).toBe("case case--element");
    expect(a.style.opacity).toBe("");
    expect(a.style.transform).toBe("");
    expect(document.body.classList.contains("glisser-en-cours")).toBe(false);
  });
  it("idempotent : le deuxième appel ne fait rien", () => {
    grilleAvecFantome();
    nettoyerGlisser();
    expect(nettoyerGlisser()).toBe(0);
  });
  it("sans glisser en cours : aucun effet sur la page", () => {
    document.body.innerHTML = '<div class="case case--element"></div>';
    expect(nettoyerGlisser()).toBe(0);
    expect(document.body.innerHTML).toBe('<div class="case case--element"></div>');
  });
  it("un glisser coupé sans fin (touchcancel) : la copie disparaît et la grille est rendue une fois", async () => {
    vi.useFakeTimers();
    const store = creerStore(etatInitial(), reduire);
    const rendre = vi.fn();
    const { grille, copie } = grilleAvecFantome();
    const g = activerGlisser(store, grille, { rendre });
    document.dispatchEvent(new Event("touchcancel", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(700);
    expect(copie.isConnected).toBe(false);
    expect(rendre).toHaveBeenCalled();
    g.detruire();
    vi.useRealTimers();
  });
});

describe("copie restée après un glisser coupé : le prochain appui la retire", () => {
  it("un simple toucher sur la page suffit", () => {
    const store = creerStore(etatInitial(), reduire);
    const { grille, copie } = grilleAvecFantome();
    const g = activerGlisser(store, grille, { rendre: vi.fn() });
    document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(copie.isConnected).toBe(false);
    g.detruire();
  });
});

describe("deux grilles (accueil + dossier ouvert)", () => {
  it("un appui pendant le glisser d'une autre grille ne retire pas sa copie", () => {
    const store = creerStore(etatInitial(), reduire);
    const { grille, copie } = grilleAvecFantome();
    const autre = document.createElement("div");
    document.body.append(autre);
    let options;
    const accueil = activerGlisser(store, grille, { rendre: vi.fn(), surDebut: () => {} });
    const dossier = activerGlisser(store, autre, { rendre: vi.fn() });
    // The home grid's drag is running: its onStart has been called by SortableJS.
    options = grille[Object.keys(grille).find((k) => k.startsWith("Sortable"))]?.options;
    options.onStart({ item: grille.firstElementChild });
    document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(copie.isConnected).toBe(true);
    accueil.terminerDeForce();
    expect(copie.isConnected).toBe(false);
    accueil.detruire();
    dossier.detruire();
  });
});
