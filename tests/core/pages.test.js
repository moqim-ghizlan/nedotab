import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import {
  borner,
  capacite,
  decouper,
  indexApresDepot,
  indexGlobal,
  nombrePages,
  pageApresRedimensionnement,
  pageDeIndex,
} from "../../src/core/pages.js";

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });
const sites = (n) => Array.from({ length: n }, (_, i) => site(`s${i}`));

describe("capacite", () => {
  const tuile = { largeurTuile: 96, hauteurTuile: 100, ecartX: 12, ecartY: 16 };
  it("grand écran", () => {
    expect(capacite({ largeur: 960, hauteur: 600, ...tuile })).toEqual({
      colonnes: 9,
      lignes: 5,
      parPage: 45,
    });
  });
  it("petit écran", () => {
    expect(capacite({ largeur: 360, hauteur: 500, ...tuile })).toEqual({
      colonnes: 3,
      lignes: 4,
      parPage: 12,
    });
  });
  it("fenêtre minuscule : au moins 4 par page", () => {
    expect(capacite({ largeur: 50, hauteur: 40, ...tuile })).toEqual({
      colonnes: 1,
      lignes: 1,
      parPage: 4,
    });
  });
  it("écarts nuls", () => {
    expect(
      capacite({ largeur: 400, hauteur: 300, largeurTuile: 100, hauteurTuile: 100 }).parPage,
    ).toBe(12);
  });
  it("colonnes forcées sur cet appareil", () => {
    expect(capacite({ largeur: 960, hauteur: 600, ...tuile, colonnesForcees: 5 }).parPage).toBe(25);
  });
});

describe("decouper", () => {
  // [elements, number of pages, elements on the last page, "+" on the last page]
  for (const [n, pages, derniers] of [
    [0, 1, 0],
    [1, 1, 1],
    [19, 1, 19],
    [20, 2, 0],
    [21, 2, 1],
    [40, 3, 0],
    [41, 3, 1],
  ]) {
    it(`${n} éléments, 20 par page → ${pages} page(s), « + » en dernier`, () => {
      const resultat = decouper(sites(n), 20);
      expect(resultat).toHaveLength(pages);
      expect(nombrePages(n, 20)).toBe(pages);
      const derniere = resultat.at(-1);
      expect(derniere.elements).toHaveLength(derniers);
      expect(derniere.ajout).toBe(true);
      expect(resultat.slice(0, -1).every((p) => !p.ajout && p.elements.length === 20)).toBe(true);
      expect(resultat.flatMap((p) => p.elements)).toHaveLength(n);
    });
  }
  it("sans tuile « + » (lecture seule) : pas de page en plus", () => {
    expect(decouper(sites(20), 20, { avecTuileAjout: false })).toHaveLength(1);
    expect(nombrePages(0, 20, false)).toBe(1);
  });
});

describe("index", () => {
  it("indexGlobal et pageDeIndex sont réciproques", () => {
    for (let i = 0; i < 200; i++) {
      const page = pageDeIndex(i, 12);
      expect(indexGlobal(page, i - page * 12, 12)).toBe(i);
    }
  });
  it("glisser de la page 1 (index 3) vers la page 2 (index 5), 20 par page", () => {
    // The drop is shown with page 1 missing one element: the dragged element lands after
    // the 5th tile shown on page 2, i.e. between s24 and s25.
    const versIndex = indexApresDepot({
      pageSource: 0,
      pageCible: 1,
      indexDansPage: 5,
      parPage: 20,
    });
    expect(versIndex).toBe(24);
    const g = reduire(
      { grille: sites(45), reglages: {} },
      { type: A.ELEMENT_DEPLACER, id: "s3", versParentId: null, versIndex },
    ).grille.map((e) => e.id);
    expect(g.slice(23, 26)).toEqual(["s24", "s3", "s25"]);
  });
  it("vers une page précédente : pas de décalage", () => {
    expect(indexApresDepot({ pageSource: 2, pageCible: 0, indexDansPage: 4, parPage: 20 })).toBe(4);
  });
  it("dépôt sur la page vide temporaire : fin de la liste", () => {
    const versIndex = indexApresDepot({
      pageSource: 0,
      pageCible: 3,
      indexDansPage: 0,
      parPage: 20,
    });
    const g = reduire(
      { grille: sites(45), reglages: {} },
      { type: A.ELEMENT_DEPLACER, id: "s2", versParentId: null, versIndex },
    ).grille;
    expect(g.at(-1).id).toBe("s2");
  });
  it("borner", () => {
    expect(borner(-1, 3)).toBe(0);
    expect(borner(5, 3)).toBe(2);
    expect(borner(1, 3)).toBe(1);
    expect(borner(0, 0)).toBe(0);
  });
  it("redimensionnement 20 → 12 par page : la page qui contient l'ancien premier élément", () => {
    // page 3 (index 2) started with element 40 → page 4 (index 3) with 12 per page
    expect(
      pageApresRedimensionnement({ pageActuelle: 2, ancienParPage: 20, nouveauParPage: 12 }),
    ).toBe(3);
    expect(
      pageApresRedimensionnement({ pageActuelle: 3, ancienParPage: 12, nouveauParPage: 20 }),
    ).toBe(1);
  });
});

/** What the user sees at the drop: pages cut from the list, the element moved in them. */
function ordreAffiche(ids, parPage, source, pageCible, indexDansPage) {
  const pages = decouper(ids, parPage, { avecTuileAjout: false }).map((p) => [...p.elements]);
  const pageSource = pageDeIndex(source, parPage);
  const [deplace] = pages[pageSource].splice(source - pageSource * parPage, 1);
  while (pages.length <= pageCible) pages.push([]);
  const cible = pages[pageCible];
  cible.splice(Math.min(indexDansPage, cible.length), 0, deplace);
  return pages.flat();
}

describe("propriété : déplacements entre pages", () => {
  it("1 000 déplacements aléatoires, capacités variables : rien de perdu, l'ordre affiché est gardé", () => {
    let graine = 7;
    const hasard = (n) => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return Math.floor((graine / 2147483648) * n);
    };
    let etat = { grille: sites(57), reglages: {} };
    for (let i = 0; i < 1000; i++) {
      const ids = etat.grille.map((e) => e.id);
      const parPage = 4 + hasard(30);
      const source = hasard(ids.length);
      const nb = nombrePages(ids.length, parPage, false);
      // A page that exists, or the temporary empty page after the last one.
      const pageCible = hasard(nb + 1);
      const pageSource = pageDeIndex(source, parPage);
      const tailleCible = pageCible >= nb ? 0 : Math.min(parPage, ids.length - pageCible * parPage);
      const indexDansPage = hasard(tailleCible + (pageCible === pageSource ? 0 : 1));
      const attendu = ordreAffiche(ids, parPage, source, pageCible, indexDansPage);
      etat = reduire(etat, {
        type: A.ELEMENT_DEPLACER,
        id: ids[source],
        versParentId: null,
        versIndex: indexApresDepot({ pageSource, pageCible, indexDansPage, parPage }),
      });
      const apres = etat.grille.map((e) => e.id);
      expect(new Set(apres).size).toBe(57);
      expect(apres).toEqual(attendu);
    }
  });
});
