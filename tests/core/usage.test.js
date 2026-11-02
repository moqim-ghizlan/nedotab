import { describe, expect, it } from "vitest";
import { DEMI_VIE_JOURS, EPOQUE_USAGE } from "../../src/core/constantes.js";
import {
  classementUsage,
  entreesOrphelines,
  estDoublon,
  fusionnerVisites,
  niveauUsage,
  normaliserStats,
  poidsVisite,
  renormaliser,
  scoreActuel,
  statsDeVisites,
} from "../../src/core/usage.js";

const JOUR = 86_400_000;
const T0 = EPOQUE_USAGE + 400 * JOUR;
const site = (id, titre = id) => ({ id, type: "site", titre, url: `https://${id}.fr`, creeLe: 0 });

describe("score d'usage : fréquence + récence", () => {
  it("une visite aujourd'hui vaut 1, il y a 30 jours 0,5, il y a 60 jours 0,25", () => {
    expect(scoreActuel(poidsVisite(T0), T0)).toBeCloseTo(1);
    expect(scoreActuel(poidsVisite(T0 - DEMI_VIE_JOURS * JOUR), T0)).toBeCloseTo(0.5);
    expect(scoreActuel(poidsVisite(T0 - 2 * DEMI_VIE_JOURS * JOUR), T0)).toBeCloseTo(0.25);
  });

  it("10 visites il y a un an < 3 visites cette semaine", () => {
    const ancien = 10 * poidsVisite(T0 - 365 * JOUR);
    const recent = 3 * poidsVisite(T0 - 3 * JOUR);
    expect(scoreActuel(ancien, T0)).toBeLessThan(scoreActuel(recent, T0));
  });

  it("l'addition est commutative : l'ordre des écritures ne change rien", () => {
    const visites = [0, 5, 12, 40, 41].map((j) => ({ id: "a", quand: T0 - j * JOUR }));
    const sens = statsDeVisites(visites).poids.a;
    const envers = statsDeVisites([...visites].reverse()).poids.a;
    expect(sens).toBeCloseTo(envers, 10);
    const moitie = fusionnerVisites(
      statsDeVisites(visites.slice(0, 2)),
      statsDeVisites(visites.slice(2)),
    );
    expect(moitie.poids.a).toBeCloseTo(sens, 10);
    expect(moitie.compte.a).toBe(5);
  });

  it("ignore les valeurs aberrantes", () => {
    const s = normaliserStats({
      poids: { a: NaN, b: -1, c: Infinity, d: 2, e: "x" },
      compte: { d: 3 },
    });
    expect(Object.keys(s.poids)).toEqual(["d"]);
    expect(scoreActuel(NaN, T0)).toBe(0);
    expect(scoreActuel(-3, T0)).toBe(0);
  });

  it("pas de dépassement dans 80 ans, et la renormalisation garde le classement", () => {
    const loin = T0 + 80 * 365 * JOUR;
    expect(Number.isFinite(poidsVisite(loin))).toBe(true);
    expect(scoreActuel(poidsVisite(loin), loin)).toBeCloseTo(1);
    const stats = { poids: { a: 5, b: 9 }, compte: { a: 1, b: 1 }, derniere: {} };
    const r = renormaliser(stats, 300);
    expect(r.poids.b / r.poids.a).toBeCloseTo(9 / 5);
  });

  it("anti-doublon : moins de 10 secondes = une visite", () => {
    const m = new Map([["a", 1000]]);
    expect(estDoublon(m, "a", 1000 + 9_999)).toBe(true);
    expect(estDoublon(m, "a", 1000 + 10_000)).toBe(false);
    expect(estDoublon(m, "b", 1000)).toBe(false);
  });
});

describe("classementUsage", () => {
  const grille = [
    site("a", "Alpha"),
    { id: "d", type: "dossier", titre: "D", items: [site("b", "Beta")] },
  ];
  it("trie par score, ignore les sites disparus, départage par dernière visite puis titre", () => {
    const stats = statsDeVisites([
      { id: "b", quand: T0 - JOUR },
      { id: "a", quand: T0 - JOUR },
      { id: "fantome", quand: T0 },
    ]);
    const r = classementUsage(stats, grille, T0);
    expect(r.map((x) => x.site.id)).toEqual(["a", "b"]);
    expect(entreesOrphelines(stats, grille)).toEqual(["fantome"]);
    const plusRecent = classementUsage(
      statsDeVisites([
        { id: "a", quand: T0 - 2 * JOUR },
        { id: "b", quand: T0 - 2 * JOUR + 1000 },
      ]),
      grille,
      T0,
    );
    expect(plusRecent[0].site.id).toBe("b");
  });
  it("niveaux d'usage", () => {
    expect([0, 0.5, 1.5, 4].map(niveauUsage)).toEqual(["jamais", "faible", "moyen", "fort"]);
  });
});
