import { describe, expect, it } from "vitest";
import {
  deltaDominant,
  etatMoletteInitial,
  traiterMolette,
  VERROU_MS,
} from "../../src/core/molette.js";

/** Plays a sequence of [time, deltaY, extra] events; returns the page changes. */
function jouer(evenements) {
  let etat = etatMoletteInitial();
  const sens = [];
  const intercepte = [];
  for (const [temps, deltaY, autres = {}] of evenements) {
    const r = traiterMolette(etat, { deltaY, temps, ...autres });
    etat = r.etat;
    if (r.sens) sens.push(r.sens);
    intercepte.push(r.intercepter);
  }
  return { sens, intercepte };
}

describe("molette", () => {
  it("petits deltas successifs d'un trackpad → un seul changement de page", () => {
    const geste = Array.from({ length: 40 }, (_, i) => [i * 16, 8]);
    expect(jouer(geste).sens).toEqual([1]);
  });

  it("inertie pendant et après le verrouillage → ignorée", () => {
    const geste = [
      ...Array.from({ length: 10 }, (_, i) => [i * 16, 12]),
      // decaying inertia, well after the lock
      ...Array.from({ length: 80 }, (_, i) => [160 + i * 16, Math.max(1, 30 - i * 0.35)]),
    ];
    expect(jouer(geste).sens).toEqual([1]);
  });

  it("cran franc après le verrouillage → page suivante", () => {
    expect(
      jouer([
        [0, 100],
        [VERROU_MS + 200, 100],
      ]).sens,
    ).toEqual([1, 1]);
  });

  it("deux crans pendant le verrouillage → une seule page", () => {
    expect(
      jouer([
        [0, 100],
        [100, 100],
      ]).sens,
    ).toEqual([1]);
  });

  it("vers le haut → page précédente", () => {
    expect(jouer([[0, -120]]).sens).toEqual([-1]);
  });

  it("deltaX dominant (balayage horizontal du trackpad)", () => {
    const r = traiterMolette(etatMoletteInitial(), { deltaX: -90, deltaY: 10, temps: 0 });
    expect(r.sens).toBe(-1);
    expect(deltaDominant({ deltaX: 3, deltaY: -40 })).toBe(-40);
  });

  it("Ctrl ou Cmd enfoncé → non intercepté (zoom du navigateur)", () => {
    const { sens, intercepte } = jouer([
      [0, 120, { ctrlKey: true }],
      [500, 120, { metaKey: true }],
    ]);
    expect(sens).toEqual([]);
    expect(intercepte).toEqual([false, false]);
  });

  it("deltaMode lignes : 3 lignes = 48 px, deux crans font une page", () => {
    expect(deltaDominant({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(
      jouer([
        [0, 3, { deltaMode: 1 }],
        [40, 3, { deltaMode: 1 }],
      ]).sens,
    ).toEqual([1]);
  });

  it("deltaMode pages : une page entière", () => {
    expect(deltaDominant({ deltaY: 1, deltaMode: 2 }, 700)).toBe(700);
  });

  it("une pause oublie ce qui a été accumulé", () => {
    expect(
      jouer([
        [0, 40],
        [1000, 40],
      ]).sens,
    ).toEqual([]);
  });
});
