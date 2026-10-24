import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import {
  contraste,
  estClaire,
  luminance,
  moyenne,
  TEXTE_SUR_CLAIR,
  TEXTE_SUR_SOMBRE,
} from "../../src/core/couleurs.js";
import { migrer } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";
import { validerFond } from "../../src/core/reglages.js";
import { DEGRADES } from "../../src/ui/fonds.js";

describe("luminance et choix du texte", () => {
  it("blanc, noir, gris moyen", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#777777")).toBeCloseTo(0.184, 2);
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21);
  });
  it("couleurs vives", () => {
    expect(estClaire("#ffff00")).toBe(true); // yellow: dark text
    expect(estClaire("#0000ff")).toBe(false); // blue: white text
    expect(estClaire("#c00000")).toBe(false);
    expect(estClaire("#00ff00")).toBe(true);
    expect(estClaire("#ffffff")).toBe(true);
    expect(estClaire("#000000")).toBe(false);
  });
});

describe("contraste des 8 dégradés", () => {
  // The average colour of the stops stands for the gradient; the text colour is the one
  // chosen by estClaire(). WCAG AA for normal text requires 4.5:1.
  for (const [nom, { couleurs }] of Object.entries(DEGRADES)) {
    it(`${nom} ≥ 4,5:1`, () => {
      const fond = moyenne(couleurs);
      const texte = estClaire(fond) ? TEXTE_SUR_CLAIR : TEXTE_SUR_SOMBRE;
      expect(contraste(fond, texte)).toBeGreaterThanOrEqual(4.5);
      // and on each stop too, so that no part of the gradient becomes unreadable
      for (const c of couleurs) expect(contraste(c, texte)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("REGLAGES_MODIFIER", () => {
  const etat = etatInitial();
  const modifier = (changements) => reduire(etat, { type: A.REGLAGES_MODIFIER, changements });
  it("thème", () => {
    expect(modifier({ theme: "sombre" }).reglages.theme).toBe("sombre");
    expect(modifier({ theme: "rose" })).toBe(etat);
  });
  it("refuse une clé inconnue", () => {
    expect(modifier({ police: "Comic" })).toBe(etat);
    expect(modifier({ theme: "clair", police: "Comic" })).toBe(etat);
  });
  it("refuse une couleur invalide", () => {
    expect(modifier({ fond: { type: "couleur", valeur: "rouge" } })).toBe(etat);
    expect(modifier({ fond: { type: "couleur", valeur: "#12345" } })).toBe(etat);
    expect(modifier({ fond: { type: "couleur", valeur: "#AbCdEf" } }).reglages.fond.valeur).toBe(
      "#abcdef",
    );
  });
  it("borne voile et flou", () => {
    const fond = modifier({
      fond: { type: "image", ref: "local:x", dominante: "#123456", voile: 3, flou: 99 },
    }).reglages.fond;
    expect(fond).toMatchObject({ voile: 0.7, flou: 20 });
    expect(validerFond({ type: "image", ref: "local:x", voile: -1, flou: -5 })).toMatchObject({
      voile: 0,
      flou: 0,
    });
  });
  it("refuse une image qui n'est pas locale et un dégradé inconnu", () => {
    expect(modifier({ fond: { type: "image", ref: "https://x/y.jpg" } })).toBe(etat);
    expect(modifier({ fond: { type: "degrade", valeur: "arc-en-ciel" } })).toBe(etat);
  });
});

describe("migration des réglages", () => {
  it("un état sans reglages.fond reçoit { type: 'aucun' }", () => {
    expect(
      migrer({ versionSchema: 1, grille: [], reglages: { theme: "sombre" } }).etat.reglages,
    ).toEqual({
      theme: "sombre",
      fond: { type: "aucun" },
    });
  });
  it("valeurs invalides remplacées par les valeurs par défaut", () => {
    expect(
      migrer({ versionSchema: 1, grille: [], reglages: { theme: 3, fond: { type: "?" } } }).etat
        .reglages,
    ).toEqual({
      theme: "auto",
      fond: { type: "aucun" },
    });
  });
});
