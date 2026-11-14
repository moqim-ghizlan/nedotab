import { describe, expect, it } from "vitest";
import { boiteDeBase, limiterDecalage } from "../../src/core/positionFenetre.js";

const cadre = { width: 1000, height: 800 };
const base = { left: 100, top: 50, width: 800, height: 700 };

describe("limiterDecalage", () => {
  it("laisse passer un décalage qui reste dans le cadre", () => {
    expect(limiterDecalage({ x: 20, y: -10 }, base, cadre)).toEqual({ x: 20, y: -10 });
  });
  it("arrête la fenêtre à chaque bord", () => {
    expect(limiterDecalage({ x: -500, y: -500 }, base, cadre)).toEqual({ x: -100, y: -50 });
    expect(limiterDecalage({ x: 500, y: 500 }, base, cadre)).toEqual({ x: 100, y: 50 });
  });
  it("aligne en haut à gauche une fenêtre plus grande que le cadre", () => {
    const grande = { left: -50, top: -20, width: 1200, height: 900 };
    expect(limiterDecalage({ x: 300, y: 300 }, grande, cadre)).toEqual({ x: 50, y: 20 });
  });
  it("traite les valeurs invalides comme zéro", () => {
    expect(limiterDecalage({ x: NaN, y: undefined }, base, cadre)).toEqual({ x: 0, y: 0 });
    expect(limiterDecalage(null, base, cadre)).toEqual({ x: 0, y: 0 });
  });
});

describe("boiteDeBase", () => {
  it("retire le décalage courant de la boîte mesurée", () => {
    expect(boiteDeBase({ left: 130, top: 40, width: 800, height: 700 }, { x: 30, y: -10 })).toEqual({
      left: 100, top: 50, width: 800, height: 700,
    });
  });
});
