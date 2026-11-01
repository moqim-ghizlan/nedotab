import { describe, expect, it } from "vitest";
import {
  coutEstime,
  etatLimites,
  formaterEuros,
  prixDe,
  validerLimites,
} from "../../src/core/estimation.js";

const prix = { "gemini:m": { entreeParMillion: 0.8, sortieParMillion: 4, devise: "USD" } };

describe("coutEstime", () => {
  it("jetons x prix par million, converti en euros avec le taux fixe", () => {
    const p = prixDe(prix, "gemini", "m");
    expect(coutEstime({ entree: 1_000_000, sortie: 500_000 }, p, { USD: 0.9 })).toBeCloseTo(
      (0.8 + 2) * 0.9,
    );
  });
  it("euros : pas de taux nécessaire ; devise sans taux ou prix inconnu : null", () => {
    expect(coutEstime({ entree: 1e6, sortie: 0 }, { entreeParMillion: 1, sortieParMillion: 1, devise: "EUR" })).toBe(1);
    expect(coutEstime({ entree: 1e6 }, prixDe(prix, "gemini", "m"), {})).toBeNull();
    expect(coutEstime({ entree: 1e6 }, prixDe(prix, "gemini", "autre"), { USD: 1 })).toBeNull();
  });
  it("prix saisis par l'utilisateur pour un modèle personnalisé ; valeurs absurdes ignorées", () => {
    const perso = { "gemini:mien": { entreeParMillion: 2, sortieParMillion: 6, devise: "EUR" } };
    expect(prixDe(prix, "gemini", "mien", perso)).toMatchObject({ entreeParMillion: 2 });
    expect(prixDe({ "a:b": { entreeParMillion: -1, sortieParMillion: 1 } }, "a", "b")).toBeNull();
    expect(prixDe({ "a:b": { entreeParMillion: "x", sortieParMillion: 1 } }, "a", "b")).toBeNull();
  });
  it("jetons négatifs ou absents comptés pour 0", () => {
    const p = { entreeParMillion: 1, sortieParMillion: 1, devise: "EUR" };
    expect(coutEstime({ entree: -5 }, p)).toBe(0);
    expect(coutEstime(undefined, p)).toBe(0);
  });
});

describe("formaterEuros", () => {
  it.each([
    [0, "0,00 €"],
    [0.0042, "0,0042 €"],
    [0.12, "0,12 €"],
    [3.4, "3,40 €"],
    [null, "prix inconnu"],
    [NaN, "prix inconnu"],
  ])("%s → %s", (v, attendu) => expect(formaterEuros(v)).toBe(attendu));
});

describe("validerLimites", () => {
  it("garde les limites valides, rejette le reste, null si rien", () => {
    expect(validerLimites({ jour: { appels: 20, euros: 0.5 }, mois: { euros: 3 } })).toEqual({
      jour: { appels: 20, euros: 0.5 },
      mois: { euros: 3 },
    });
    expect(validerLimites({ jour: { appels: -1, euros: "x" }, mois: { appels: 1.5 } })).toBeNull();
    expect(validerLimites(null)).toBeNull();
    expect(validerLimites({})).toBeNull();
  });
  it("une toute petite limite en euros reste une limite", () => {
    expect(validerLimites({ jour: { euros: 0.002 } })).toEqual({ jour: { euros: 0.002 } });
    expect(validerLimites({ jour: { euros: 0.00001 } })).toBeNull();
  });
});

describe("etatLimites", () => {
  const limites = { jour: { appels: 10 }, mois: { euros: 2 } };
  const usage = (j, m) => ({ jour: { appels: j, coutEstime: 0 }, mois: { appels: 0, coutEstime: m } });
  it("sous 80 % : rien", () => {
    expect(etatLimites(limites, usage(7, 1))).toEqual({ atteinte: null, alertes: [] });
  });
  it("à 80 % : alerte discrète ; à 100 % : atteinte", () => {
    expect(etatLimites(limites, usage(8, 0)).alertes).toEqual([{ periode: "jour", type: "appels", pourcent: 80 }]);
    expect(etatLimites(limites, usage(10, 0)).atteinte).toEqual({ periode: "jour", type: "appels" });
    expect(etatLimites(limites, usage(0, 2)).atteinte).toEqual({ periode: "mois", type: "euros" });
  });
  it("sans limite : jamais d'alerte", () => {
    expect(etatLimites(null, usage(999, 999))).toEqual({ atteinte: null, alertes: [] });
  });
});
