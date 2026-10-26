import { describe, expect, it } from "vitest";
import { indexInsertion } from "../../src/core/insertion.js";

// Grille 3 × 2 de cases 60 × 60 espacées de 20 px : (0,0) (80,0) (160,0) / (0,80) (80,80).
const r = (left, top) => ({ left, top, right: left + 60, bottom: top + 60, width: 60 });
const cases = [r(0, 0), r(80, 0), r(160, 0), r(0, 80), r(80, 80)];

describe("indexInsertion", () => {
  it("grille vide : au début", () => {
    expect(indexInsertion([], 10, 10)).toBe(0);
  });
  it("moitié gauche d'une case : avant elle", () => {
    expect(indexInsertion(cases, 90, 30)).toBe(1);
  });
  it("moitié droite d'une case : après elle", () => {
    expect(indexInsertion(cases, 130, 30)).toBe(2);
  });
  it("dans l'espace entre deux cases : du côté le plus proche", () => {
    expect(indexInsertion(cases, 75, 30)).toBe(1);
  });
  it("après la dernière case de la grille", () => {
    expect(indexInsertion(cases, 200, 110)).toBe(5);
  });
  it("sous la grille : à la fin", () => {
    expect(indexInsertion(cases, 20, 400)).toBe(5);
  });
  it("au-dessus de la grille : dans la première rangée", () => {
    expect(indexInsertion(cases, 170, -50)).toBe(2);
  });
});

describe("indexInsertion entre deux rangées", () => {
  it("prend la rangée la plus proche", () => {
    expect(indexInsertion(cases, 20, 65)).toBe(0);
    expect(indexInsertion(cases, 20, 77)).toBe(3);
  });
});
