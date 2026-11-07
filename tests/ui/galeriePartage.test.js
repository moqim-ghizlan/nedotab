import { afterEach, describe, expect, it, vi } from "vitest";
import { creerGalerie } from "../../src/ui/galeriePartage.js";

afterEach(() => document.body.replaceChildren());

function monter() {
  const items = [
    { id: "a", type: "texte", contenu: "bonjour", titre: "bonjour", creeLe: Date.now() },
    { id: "b", type: "texte", contenu: "salut", titre: "salut", creeLe: Date.now() },
  ];
  const api = {
    vues: () => items,
    abonner: () => () => {},
    urlApercu: vi.fn(async () => null),
    deverrouiller: vi.fn(),
    actions: () => [],
    lot: { supprimer: vi.fn(), prolonger: vi.fn(), telecharger: vi.fn() },
    ecart: () => 0,
    appareil: (i) => i.appareil ?? "",
  };
  return creerGalerie(api);
}
const bouton = () => document.querySelector(".pgal-entete .pgal-bouton:last-child");

describe("galerie : le ✕ ferme un seul niveau", () => {
  it("ferme l'aperçu puis la galerie", () => {
    const g = monter();
    g.ouvrir("a");
    expect(bouton().title).toContain("aperçu");
    bouton().click();
    expect(g.estOuverte()).toBe(true);
    expect(document.querySelector(".pgal-visionneuse").hidden).toBe(true);
    expect(bouton().title).toContain("galerie");
    bouton().click();
    expect(g.estOuverte()).toBe(false);
  });

  it("Échap se comporte pareil", () => {
    const g = monter();
    g.ouvrir("a");
    const echap = () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    echap();
    expect(g.estOuverte()).toBe(true);
    echap();
    expect(g.estOuverte()).toBe(false);
  });
});

describe("galerie : mode sélection", () => {
  const ouvrirG = () => {
    const g = monter();
    g.ouvrir();
    return g;
  };
  const cases = () => [...document.querySelectorAll(".pgal-case .pgal-coche")];
  const tuile = (id) => document.querySelector(`.pgal-tuile[data-id="${id}"]`);

  it("mode normal : aucune case, ni sur les cartes ni sur les périodes", () => {
    ouvrirG();
    expect(cases()).toHaveLength(0);
    expect(document.querySelector(".pgal-coche--groupe")).toBeNull();
    expect(document.querySelector(".pgal-selection").hidden).toBe(true);
  });

  it("« Sélectionner » fait apparaître les cases ; un clic sur une carte la coche", () => {
    ouvrirG();
    const bouton = document.querySelector(".pgal-selectionner");
    bouton.click();
    expect(bouton.getAttribute("aria-pressed")).toBe("true");
    expect(cases()).toHaveLength(2);
    expect(cases()[0].getAttribute("role")).toBe("checkbox");
    tuile("a").click();
    expect(document.querySelector(".pgal-selection-compte").textContent).toBe("1 sélectionné");
    expect(document.querySelector(".pgal-visionneuse").hidden).toBe(true); // a click selects, it does not open
  });

  it("la case de la période sélectionne tout, puis devient partielle quand on en décoche un", () => {
    ouvrirG();
    document.querySelector(".pgal-selectionner").click();
    document.querySelector(".pgal-coche--groupe").click();
    expect(document.querySelector(".pgal-selection-compte").textContent).toBe("2 sélectionnés");
    expect(document.querySelector(".pgal-coche--groupe").getAttribute("aria-checked")).toBe("true");
    cases()[0].click();
    expect(document.querySelector(".pgal-coche--groupe").getAttribute("aria-checked")).toBe("mixed");
    document.querySelector(".pgal-coche--groupe").click();
    expect(document.querySelector(".pgal-selection-compte").textContent).toBe("2 sélectionnés");
  });

  it("Terminer et Échap quittent le mode et vident la sélection", () => {
    const g = ouvrirG();
    document.querySelector(".pgal-selectionner").click();
    tuile("a").click();
    document.querySelector(".pgal-terminer").click();
    expect(cases()).toHaveLength(0);
    document.querySelector(".pgal-selectionner").click();
    tuile("b").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(g.estOuverte()).toBe(true);
    expect(cases()).toHaveLength(0);
    document.querySelector(".pgal-selectionner").click();
    expect(document.querySelector(".pgal-selection-compte").textContent).toBe("Aucun élément sélectionné");
  });

  it("clic droit sur une carte : entre dans le mode avec cette carte cochée", () => {
    ouvrirG();
    tuile("b").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector(".pgal-selection-compte").textContent).toBe("1 sélectionné");
  });

  it("supprimer la sélection demande confirmation, rien n'est supprimé avant", async () => {
    const items = [{ id: "a", type: "texte", contenu: "x", titre: "x", creeLe: Date.now() }];
    const supprimer = vi.fn();
    const g = creerGalerie({
      vues: () => items, abonner: () => () => {}, urlApercu: async () => null, deverrouiller: vi.fn(), actions: () => [],
      lot: { supprimer, prolonger: vi.fn(), telecharger: vi.fn() }, ecart: () => 0, appareil: () => "",
    });
    g.ouvrir();
    document.querySelector(".pgal-selectionner").click();
    tuile("a").click();
    [...document.querySelectorAll(".pgal-selection .bouton")].find((b) => b.textContent === "Supprimer").click();
    const conf = document.querySelector('[role="alertdialog"]');
    expect(conf.textContent).toContain("irréversible");
    expect(supprimer).not.toHaveBeenCalled();
    [...conf.querySelectorAll("button")].find((b) => b.textContent === "Annuler").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(supprimer).not.toHaveBeenCalled();
  });
});
