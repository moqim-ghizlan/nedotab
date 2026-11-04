import { describe, expect, it } from "vitest";
import {
  categorieDe,
  compterFiltres,
  filtrerItems,
  grouperParDate,
  selectionValide,
} from "../../src/core/galeriePartage.js";

const M = new Date(2026, 9, 30, 15, 0).getTime(); // 30 oct. 2026, 15:00 (local)
const jours = (n, h = 10) => new Date(2026, 9, 30 - n, h, 0).getTime();
const it_ = (id, o = {}) => ({ id, type: "texte", contenu: id, creeLe: M, ...o });

describe("grouperParDate", () => {
  const items = [
    it_("p", { epingle: true, creeLe: jours(40) }),
    it_("a", { creeLe: jours(0, 9) }),
    it_("b", { creeLe: jours(0, 1) }),
    it_("c", { creeLe: jours(1) }),
    it_("d", { creeLe: jours(2) }),
    it_("e", { creeLe: jours(20) }),
    it_("f", { creeLe: jours(25) }),
    it_("g", { creeLe: jours(400) }),
    it_("h", { creeLe: null }),
  ];
  const g = grouperParDate(items, M, "fr-FR");
  it("épinglés d'abord, puis aujourd'hui, hier, jour de la semaine, mois, année précédente", () => {
    expect(g.map((x) => x.libelle)).toEqual([
      "Épinglés",
      "Aujourd'hui",
      expect.stringMatching(/^Hier$/),
      expect.stringMatching(/28/),
      expect.stringMatching(/oct.* 2026/),
      expect.stringMatching(/2025/),
    ]);
  });
  it("un élément sans date (envoi en cours) compte pour aujourd'hui", () => {
    expect(g[1].items.map((x) => x.id)).toEqual(["a", "b", "h"]);
  });
  it("les anciens sont regroupés par mois", () => {
    expect(g[4].items.map((x) => x.id)).toEqual(["e", "f"]);
  });
  it("liste vide : aucun groupe", () => {
    expect(grouperParDate([], M)).toEqual([]);
  });
});

describe("filtrerItems", () => {
  const items = [
    it_("t1", { titre: "Recette", contenu: "crêpes" }),
    it_("l1", { type: "lien", contenu: "https://exemple.fr" }),
    { id: "i1", type: "fichier", contenu: "photo.png", typeMime: "image/png" },
    { id: "f1", type: "fichier", contenu: "doc.pdf", typeMime: "application/pdf" },
    { id: "c1", type: "texte", chiffre: true, verrouille: true, contenu: "xxsecretxx" },
    { id: "c2", type: "texte", chiffre: true, contenu: "ouvert secret" },
  ];
  it("catégories", () => {
    expect(categorieDe(items[2])).toBe("images");
    expect(categorieDe(items[3])).toBe("fichiers");
    expect(categorieDe(items[1])).toBe("textes");
    expect(filtrerItems(items, { filtre: "images" }).map((x) => x.id)).toEqual(["i1"]);
    expect(filtrerItems(items, { filtre: "textes" }).map((x) => x.id)).toEqual([
      "t1",
      "l1",
      "c1",
      "c2",
    ]);
    expect(filtrerItems(items, { filtre: "chiffres" }).map((x) => x.id)).toEqual(["c1", "c2"]);
  });
  it("recherche sans accent ni casse, sur titre et contenu", () => {
    expect(filtrerItems(items, { recherche: "CREPES" }).map((x) => x.id)).toEqual(["t1"]);
    expect(filtrerItems(items, { recherche: "recette" }).map((x) => x.id)).toEqual(["t1"]);
  });
  it("un élément chiffré verrouillé n'est jamais trouvé par la recherche", () => {
    expect(filtrerItems(items, { recherche: "secret" }).map((x) => x.id)).toEqual(["c2"]);
  });
  it("compteurs", () => {
    expect(compterFiltres(items)).toEqual({
      tout: 6,
      images: 1,
      textes: 4,
      fichiers: 1,
      chiffres: 2,
    });
  });
});

describe("selectionValide", () => {
  it("retire les éléments disparus", () => {
    expect([...selectionValide(new Set(["a", "z"]), [{ id: "a" }])]).toEqual(["a"]);
  });
});
