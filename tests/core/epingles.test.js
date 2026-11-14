import { describe, expect, it } from "vitest";
import { trouver } from "../../src/core/arbre.js";
import {
  MAX_EPINGLES,
  deplacerEpingle,
  desepingler,
  epingler,
  listeEpingles,
  normaliserEpingles,
  peutEpingler,
} from "../../src/core/epingles.js";

const site = (id, extra = {}) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, ...extra });
const dossier = (id, items = [], extra = {}) => ({ id, type: "dossier", titre: id, items, ...extra });
const ids = (g) => listeEpingles(g).map((x) => x.element.id);

describe("épingles d'accueil", () => {
  const base = [site("a"), dossier("d", [site("b"), dossier("sd", [site("c")])]), site("e")];

  it("épingle des sites et des dossiers, à tous les niveaux, dans l'ordre", () => {
    let g = epingler(base, "c");
    g = epingler(g, "d");
    g = epingler(g, "sd");
    expect(ids(g)).toEqual(["c", "d", "sd"]);
    expect(trouver(g, "c").element.epingleAccueil).toBe(1);
  });

  it("ne bouge jamais un élément dans l'arbre", () => {
    const g = epingler(base, "b");
    expect(trouver(g, "b").parent.id).toBe("d");
    expect(trouver(g, "b").index).toBe(0);
  });

  it("refuse un doublon et un identifiant inconnu", () => {
    const g = epingler(base, "a");
    expect(epingler(g, "a")).toBe(g);
    expect(epingler(g, "zzz")).toBe(g);
    expect(peutEpingler(g, "a")).toEqual({ ok: false, raison: "deja" });
  });

  it("refuse le 11e", () => {
    const grille = Array.from({ length: MAX_EPINGLES + 1 }, (_, i) => site(`s${i}`));
    let g = grille;
    for (const s of grille.slice(0, MAX_EPINGLES)) g = epingler(g, s.id);
    expect(listeEpingles(g)).toHaveLength(MAX_EPINGLES);
    expect(peutEpingler(g, `s${MAX_EPINGLES}`)).toEqual({ ok: false, raison: "plein" });
    expect(epingler(g, `s${MAX_EPINGLES}`)).toBe(g);
  });

  it("désépingler remet l'élément à sa place et referme les rangs", () => {
    let g = epingler(epingler(epingler(base, "a"), "b"), "e");
    g = desepingler(g, "b");
    expect(ids(g)).toEqual(["a", "e"]);
    expect(trouver(g, "e").element.epingleAccueil).toBe(2);
    expect("epingleAccueil" in trouver(g, "b").element).toBe(false);
    expect(trouver(g, "b").parent.id).toBe("d");
  });

  it("déplace une épingle (début, fin, même place)", () => {
    const g = epingler(epingler(epingler(base, "a"), "b"), "e");
    expect(ids(deplacerEpingle(g, "e", 0))).toEqual(["e", "a", "b"]);
    expect(ids(deplacerEpingle(g, "a", 99))).toEqual(["b", "e", "a"]);
    expect(deplacerEpingle(g, "a", 0)).toBe(g);
    expect(deplacerEpingle(g, "zzz", 0)).toBe(g);
  });

  it("normalise des données invalides, en gardant les 10 premières", () => {
    const sale = [
      site("a", { epingleAccueil: 3 }),
      site("b", { epingleAccueil: 3 }),
      site("c", { epingleAccueil: 0 }),
      site("d", { epingleAccueil: "x" }),
      site("e", { epingleAccueil: 99 }),
    ];
    const g = normaliserEpingles(sale);
    expect(ids(g)).toEqual(["a", "b"]);
    expect(trouver(g, "b").element.epingleAccueil).toBe(2);
    expect("epingleAccueil" in trouver(g, "c").element).toBe(false);
    expect(normaliserEpingles(g)).toBe(g);
  });

  it("garde au plus 10 épingles à la normalisation", () => {
    const g = normaliserEpingles(Array.from({ length: 14 }, (_, i) => site(`s${i}`, { epingleAccueil: (i % 10) + 1 })));
    expect(listeEpingles(g)).toHaveLength(MAX_EPINGLES);
  });
});

describe("rangs après suppression d'un élément épinglé", () => {
  it("un trou dans les rangs ne crée pas de doublon", () => {
    const g = [site("a", { epingleAccueil: 1 }), site("c", { epingleAccueil: 3 }), site("n")];
    const apres = epingler(g, "n");
    expect(ids(apres)).toEqual(["a", "c", "n"]);
    expect(listeEpingles(apres).map((x) => x.element.epingleAccueil)).toEqual([1, 2, 3]);
  });
});
