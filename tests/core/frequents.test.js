import { describe, expect, it } from "vitest";
import {
  frequentsAStocker,
  frequentsDe,
  masquesObsoletes,
  nombreIcones,
  sitesFrequents,
  validerFrequents,
} from "../../src/core/frequents.js";
import { modifierReglages, validerReglages } from "../../src/core/reglages.js";

const site = (id, extra = {}) => ({
  id,
  type: "site",
  titre: id.toUpperCase(),
  url: `https://${id}.fr`,
  creeLe: 0,
  ...extra,
});
const grille = [
  site("a"),
  site("b"),
  site("c"),
  site("d"),
  { id: "dos", type: "dossier", titre: "Travail", items: [site("e")] },
];
const ligne = (id, score, compte, derniere = 0) => ({
  site: grille.flatMap((e) => (e.items ? e.items : [e])).find((s) => s.id === id),
  score,
  compte,
  derniere,
});
const ids = (r) => r.map((x) => x.site.id);

describe("sitesFrequents (V4.22)", () => {
  const classement = [ligne("a", 5, 4), ligne("b", 3, 3), ligne("e", 2, 2), ligne("c", 1, 1)];

  it("par score, y compris un site rangé dans un dossier, avec son chemin", () => {
    const r = sitesFrequents({ grille, classement, reglages: {} });
    expect(ids(r)).toEqual(["a", "b", "e", "c"]);
    expect(r.find((x) => x.site.id === "e").chemin).toEqual(["Travail"]);
  });
  it("épinglés d'abord", () => {
    const g = [site("a"), site("b", { epingle: true }), site("c"), site("d")];
    const cl = [ligne("a", 5, 6)].map((x) => ({ ...x, site: g[0] }));
    cl.push({ site: g[2], score: 3, compte: 5, derniere: 0 });
    expect(ids(sitesFrequents({ grille: g, classement: cl, reglages: {} }))[0]).toBe("b");
  });
  it("sites masqués exclus, sites supprimés ignorés", () => {
    const reglages = { frequents: { afficher: true, titre: false, masques: ["a", "fantome"] } };
    expect(ids(sitesFrequents({ grille, classement, reglages }))).not.toContain("a");
    const avecFantome = [...classement, { site: site("fantome"), score: 9, compte: 9, derniere: 0 }];
    expect(ids(sitesFrequents({ grille, classement: avecFantome, reglages: {} }))).toContain(
      "fantome",
    ); // le classement vient de classementUsage, qui ignore déjà les sites disparus
    expect(masquesObsoletes(reglages, grille)).toEqual(["fantome"]);
  });
  it("score quasi nul exclu", () => {
    const cl = [ligne("a", 5, 10), ligne("b", 3, 3), ligne("c", 1, 1), ligne("d", 0.05, 1)];
    expect(ids(sitesFrequents({ grille, classement: cl, reglages: {} }))).toEqual(["a", "b", "c"]);
  });
  it("seuil : 9 visites → pas de rangée ; 10 visites mais 2 sites → pas de rangée", () => {
    const neuf = [ligne("a", 5, 4), ligne("b", 3, 3), ligne("c", 1, 2)];
    expect(sitesFrequents({ grille, classement: neuf, reglages: {} })).toEqual([]);
    const dix = [ligne("a", 5, 6), ligne("b", 3, 4)];
    expect(sitesFrequents({ grille, classement: dix, reglages: {} })).toEqual([]);
    const ok = [ligne("a", 5, 5), ligne("b", 3, 3), ligne("c", 1, 2)];
    expect(sitesFrequents({ grille, classement: ok, reglages: {} })).toHaveLength(3);
  });
  it("3 épinglés sans visite → rangée ; 2 → non", () => {
    const g3 = [site("a", { epingle: true }), site("b", { epingle: true }), site("c", { epingle: true })];
    expect(ids(sitesFrequents({ grille: g3, classement: [], reglages: {} })).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sitesFrequents({ grille: g3.slice(0, 2), classement: [], reglages: {} })).toEqual([]);
  });
  it("max respecté", () => {
    expect(sitesFrequents({ grille, classement, reglages: {}, max: 2 })).toHaveLength(2);
  });
  it("suivi désactivé → épinglés seulement", () => {
    const g = [site("a", { epingle: true }), site("b"), site("c"), site("d")];
    expect(sitesFrequents({ grille: g, classement, reglages: {}, suiviActif: false })).toEqual([]);
    const g3 = g.map((s) => ({ ...s, epingle: true }));
    expect(
      ids(sitesFrequents({ grille: g3, classement, reglages: {}, suiviActif: false })),
    ).toHaveLength(4);
  });
});

describe("nombre d'icônes", () => {
  it.each([
    [1200, 8],
    [560, 6],
    [390, 4],
    [320, 3],
    [768, 8],
  ])("largeur %i px → %i icônes au plus", (largeur, attendu) => {
    expect(nombreIcones(largeur)).toBeLessThanOrEqual(8);
    expect(nombreIcones(largeur)).toBeGreaterThanOrEqual(3);
    if (largeur === 1200 || largeur === 320) expect(nombreIcones(largeur)).toBe(attendu);
  });
  it("plus la place diminue, moins il y a d'icônes, jamais une seconde ligne", () => {
    expect(nombreIcones(700)).toBeGreaterThanOrEqual(nombreIcones(500));
    expect(nombreIcones(0)).toBe(0);
  });
});

describe("réglage reglages.frequents", () => {
  it("valeurs par défaut non stockées, migration idempotente", () => {
    expect(frequentsAStocker({})).toBeUndefined();
    const r = validerReglages({ frequents: { afficher: false, masques: ["a", "a", 3] } });
    expect(r.frequents).toEqual({
      afficher: false,
      titre: false,
      masques: ["a"],
      accueil: false,
      nombreAccueil: 6,
    });
    expect(validerReglages(r)).toEqual(r);
    expect(validerReglages({}).frequents).toBeUndefined();
    expect(frequentsDe({})).toEqual({
      afficher: true,
      titre: false,
      masques: [],
      accueil: false,
      nombreAccueil: 6,
    });
  });
  it("bloc de l'accueil (T7) : désactivé par défaut, 6 sites, valeurs permises 4/6/8/10", () => {
    expect(frequentsDe({}).accueil).toBe(false);
    expect(frequentsDe({}).nombreAccueil).toBe(6);
    expect(validerFrequents({ nombreAccueil: 7 }).nombreAccueil).toBe(6);
    expect(validerFrequents({ nombreAccueil: 10 }).nombreAccueil).toBe(10);
    expect(validerFrequents({ accueil: "oui" }).accueil).toBe(false);
    // Stored only when something differs from the defaults.
    expect(frequentsAStocker({ accueil: true })).toMatchObject({ accueil: true });
    expect(frequentsAStocker({ nombreAccueil: 8 })).toMatchObject({ nombreAccueil: 8 });
    expect(frequentsAStocker({ accueil: false, nombreAccueil: 6 })).toBeUndefined();
    const base = validerReglages({});
    const ok = modifierReglages(base, { frequents: { accueil: true, nombreAccueil: 4 } });
    expect(frequentsDe(ok)).toMatchObject({ accueil: true, nombreAccueil: 4, afficher: true });
  });
  it("REGLAGES_MODIFIER refuse plus de 200 masqués", () => {
    const base = validerReglages({});
    const trop = Array.from({ length: 201 }, (_, i) => `s${i}`);
    expect(modifierReglages(base, { frequents: { masques: trop } })).toBe(base);
    const ok = modifierReglages(base, { frequents: { masques: ["x"] } });
    expect(ok.frequents.masques).toEqual(["x"]);
    expect(validerFrequents({ masques: trop }).masques).toHaveLength(200);
  });
});
