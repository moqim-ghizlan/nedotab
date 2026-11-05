import { describe, expect, it } from "vitest";
import {
  LIMITE_SUJETS,
  creerSujet,
  estPleinSujets,
  exporterSujets,
  lireSujet,
  nettoyerNom,
  renommerSujet,
  trierSujets,
  validerNom,
} from "../../src/core/sujets.js";

describe("nom de sujet", () => {
  it("retire les caractères de contrôle et de direction", () => {
    expect(nettoyerNom("  Tra\u202Evail\u0000  perso ")).toBe("Tra vail perso");
  });
  it("refuse vide et plus de 60 caractères", () => {
    expect(validerNom("   ")).toMatch(/nom/);
    expect(validerNom("a".repeat(60))).toBeNull();
    expect(validerNom("a".repeat(61))).toMatch(/60/);
  });
});

describe("creerSujet / renommerSujet", () => {
  it("crée un sujet avec des compteurs à zéro", () => {
    const r = creerSujet({ nom: " Courses ", couleur: "mer" });
    expect(r.ok).toBe(true);
    expect(r.sujet).toMatchObject({ nom: "Courses", couleur: "mer", nbRestants: 0, nbTotal: 0 });
  });
  it("refuse une couleur inconnue", () => {
    expect(creerSujet({ nom: "x", couleur: "fluo" }).ok).toBe(false);
  });
  it("renomme sans modifier l'original", () => {
    const base = creerSujet({ nom: "a" }).sujet;
    const r = renommerSujet(base, "b");
    expect(r.sujet.nom).toBe("b");
    expect(base.nom).toBe("a");
    expect(renommerSujet(base, "").ok).toBe(false);
  });
  it("limite à 30 sujets", () => {
    expect(estPleinSujets(LIMITE_SUJETS - 1)).toBe(false);
    expect(estPleinSujets(LIMITE_SUJETS)).toBe(true);
  });
});

describe("lireSujet / trierSujets / exporterSujets", () => {
  it("ignore un document aberrant", () => {
    expect(lireSujet("a", null)).toBeNull();
    expect(lireSujet("a", { nom: 3 })).toBeNull();
    expect(lireSujet("a", { nom: "\u0000\u202E" })).toBeNull();
  });
  it("normalise couleur et compteurs", () => {
    const s = lireSujet("a", { nom: "x", ordre: 5, couleur: "fluo", nbRestants: -3, nbTotal: 2.5 });
    expect(s).toMatchObject({ couleur: null, nbRestants: 0, nbTotal: 0, ordre: 5 });
  });
  it("trie de façon stable", () => {
    const l = [
      { id: "b", ordre: 2, creeLe: 1 },
      { id: "a", ordre: 2, creeLe: null },
      { id: "c", ordre: 1, creeLe: 5 },
    ];
    expect(trierSujets(l).map((s) => s.id)).toEqual(["c", "b", "a"]);
  });
  it("l'export ne contient pas les compteurs", () => {
    const [e] = exporterSujets([lireSujet("a", { nom: "x", nbRestants: 3, nbTotal: 4 })]);
    expect(e).not.toHaveProperty("nbRestants");
    expect(e).not.toHaveProperty("enAttente");
  });
});
