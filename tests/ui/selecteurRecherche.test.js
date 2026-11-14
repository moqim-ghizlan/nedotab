import { afterEach, describe, expect, it } from "vitest";
import { exemple } from "../../src/core/exemple.js";
import { creerSelecteurDossier } from "../../src/ui/selecteurDossier.js";

afterEach(() => document.body.replaceChildren());

function monter() {
  const s = creerSelecteurDossier({ grille: exemple(), elementId: null, actuel: null, selection: null });
  document.body.append(s.racine);
  return s.racine;
}

describe("champ de recherche du sélecteur de dossiers", () => {
  it("a une loupe et un bouton d'effacement caché tant que le champ est vide", () => {
    const racine = monter();
    expect(racine.querySelector(".selecteur-recherche-boite .selecteur-recherche-loupe")).toBeTruthy();
    expect(racine.querySelector(".selecteur-recherche-effacer").hidden).toBe(true);
  });

  it("affiche le bouton à la saisie et l'efface d'un clic", () => {
    const racine = monter();
    const champ = racine.querySelector(".selecteur-recherche");
    const effacer = racine.querySelector(".selecteur-recherche-effacer");
    champ.value = "tra";
    champ.dispatchEvent(new Event("input"));
    expect(effacer.hidden).toBe(false);
    effacer.click();
    expect(champ.value).toBe("");
    expect(effacer.hidden).toBe(true);
  });
});
