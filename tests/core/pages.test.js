import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { migrer } from "../../src/core/migration.js";
import {
  comptesAStocker,
  comptesDe,
  comptesParDefaut,
  decouperParComptes,
  indexGlobalDansPages,
  normaliserComptes,
  positionDans,
  validerGrilleAccueil,
} from "../../src/core/pages.js";

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });
const sites = (n, depuis = 0) => Array.from({ length: n }, (_, i) => site(`s${depuis + i}`));
/** State with `n` sites on a lignes × colonnes home grid and the given page sizes. */
const etatDe = (n, { lignes = 4, colonnes = 8, pages } = {}) => ({
  versionSchema: 2,
  grille: sites(n),
  reglages: {
    theme: "auto",
    fond: { type: "aucun" },
    fonds: [],
    grilleAccueil: { lignes, colonnes },
    ...(pages ? { pagesAccueil: pages } : {}),
  },
  reglagesAppareil: {},
});
const pagesDe = (etat) =>
  decouperParComptes(etat.grille, comptesDe(etat)).map((p) => p.map((e) => e.id));
const versPage = (etat, id, page, index) =>
  reduire(etat, {
    type: A.ELEMENT_DEPLACER,
    id,
    versParentId: null,
    versPage: page,
    versIndex: index,
  });

describe("tailles des pages", () => {
  it("découpage par défaut : pages pleines sauf la dernière, aucune page pour une liste vide", () => {
    expect(comptesParDefaut(0, 32)).toEqual([]);
    expect(comptesParDefaut(32, 32)).toEqual([32]);
    expect(comptesParDefaut(70, 32)).toEqual([32, 32, 6]);
  });
  it("normalisation : somme ajustée, débordement vers la page suivante, pas de page vide", () => {
    expect(normaliserComptes([31, 1], 32, 32)).toEqual([31, 1]);
    expect(normaliserComptes([31, 1], 34, 32)).toEqual([31, 3]); // added: on the last page
    expect(normaliserComptes([31, 5], 33, 32)).toEqual([31, 2]); // fewer: taken from the end
    expect(normaliserComptes([40], 40, 32)).toEqual([32, 8]);
    expect(normaliserComptes([0, -2, 1.5, 3], 3, 32)).toEqual([3]);
    expect(normaliserComptes(null, 40, 32)).toEqual([32, 8]);
  });
  it("rien n'est stocké tant que c'est le découpage par défaut", () => {
    expect(comptesAStocker([32, 8], 40, 32)).toBeNull();
    expect(comptesAStocker([31, 9], 40, 32)).toEqual([31, 9]);
  });
  it("position et index dans les pages", () => {
    expect(positionDans([31, 1], 31)).toEqual({ page: 1, index: 0 });
    expect(positionDans([31, 1], 32)).toBeNull();
    const liste = sites(32);
    expect(indexGlobalDansPages(liste, [31, 1], 1, 0)).toBe(31);
    expect(indexGlobalDansPages(liste, [31, 1], 2, 0)).toBe(32); // a new page: the end
  });
  it("taille de grille validée", () => {
    expect(validerGrilleAccueil({ lignes: 4, colonnes: 8 })).toEqual({ lignes: 4, colonnes: 8 });
    expect(validerGrilleAccueil({ lignes: 0, colonnes: 8 })).toBeNull();
    expect(validerGrilleAccueil({ lignes: 4, colonnes: 30 })).toBeNull();
  });
});

describe("pages enregistrées (comme Infinity)", () => {
  it("page 1 pleine : une tuile glissée sur une nouvelle page y reste seule", () => {
    const etat = versPage(etatDe(32), "s3", 1, 0);
    expect(pagesDe(etat).map((p) => p.length)).toEqual([31, 1]);
    expect(pagesDe(etat)[1]).toEqual(["s3"]);
    expect(etat.reglages.pagesAccueil).toEqual([31, 1]);
  });

  it("déposée au milieu d'une page qui a des tuiles : à la place visée", () => {
    const etat = versPage(etatDe(40), "s3", 1, 2);
    expect(pagesDe(etat)[1].slice(0, 4)).toEqual(["s32", "s33", "s3", "s34"]);
    expect(pagesDe(etat)[0]).toHaveLength(31);
  });

  it("déposée sur une page pleine : la dernière tuile de cette page passe à la suivante", () => {
    const etat = versPage(etatDe(64), "s40", 0, 0); // two full pages
    const pages = pagesDe(etat);
    expect(pages.map((p) => p.length)).toEqual([32, 32]);
    expect(pages[0][0]).toBe("s40");
    expect(pages[1][0]).toBe("s31"); // pushed from page 1
  });

  it("supprimer sur la page 1 ne fait pas remonter la page 2", () => {
    let etat = versPage(etatDe(32), "s3", 1, 0);
    etat = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: "s0" });
    expect(pagesDe(etat).map((p) => p.length)).toEqual([30, 1]);
  });

  it("la dernière tuile d'une page partie : la page disparaît", () => {
    let etat = versPage(etatDe(32), "s3", 1, 0);
    etat = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: "s3" });
    expect(pagesDe(etat).map((p) => p.length)).toEqual([31]);
    expect(etat.reglages.pagesAccueil).toBeUndefined();
  });

  it("annuler une suppression remet la tuile sur sa page", () => {
    let etat = versPage(etatDe(32), "s3", 1, 0);
    const element = etat.grille.find((e) => e.id === "s3");
    etat = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: "s3" });
    etat = reduire(etat, {
      type: A.ELEMENT_RESTAURER,
      element,
      parentId: null,
      index: 31,
      page: 1,
    });
    expect(pagesDe(etat)[1]).toEqual(["s3"]);
  });

  it("un site ajouté va sur la dernière page, ou sur une nouvelle si elle est pleine", () => {
    let etat = reduire(etatDe(30), { type: A.SITE_AJOUTER, site: site("n1"), parentId: null });
    expect(pagesDe(etat).map((p) => p.length)).toEqual([31]);
    etat = reduire(etatDe(32), { type: A.SITE_AJOUTER, site: site("n2"), parentId: null });
    expect(pagesDe(etat)).toEqual([sites(32).map((e) => e.id), ["n2"]]);
  });

  it("site sur site : le nouveau dossier reste sur la page de la cible", () => {
    let etat = versPage(etatDe(40), "s31", 1, 0); // [31, 9], s31 first on page 2
    etat = reduire(etat, {
      type: A.FUSIONNER,
      sourceId: "s5",
      cibleId: "s31",
      nouveauDossierId: "d1",
      titre: "Dossier",
    });
    expect(pagesDe(etat)[1][0]).toBe("d1");
    expect(pagesDe(etat).map((p) => p.length)).toEqual([30, 9]);
  });

  it("vider un dossier dans l'accueil : son contenu reste sur sa page", () => {
    let etat = versPage(etatDe(40), "s31", 1, 0);
    etat = reduire(etat, {
      type: A.FUSIONNER,
      sourceId: "s32",
      cibleId: "s30",
      nouveauDossierId: "d1",
    }); // d1 is the last of page 1
    etat = reduire(etat, { type: A.DOSSIER_SUPPRIMER, id: "d1", mode: "viderDansParent" });
    expect(pagesDe(etat)[0].slice(-2)).toEqual(["s30", "s32"]);
  });

  it("déplacement sans page (défilement, clavier) : la page de ses voisines", () => {
    const etat = reduire(etatDe(40), {
      type: A.ELEMENT_DEPLACER,
      id: "s2",
      versParentId: null,
      versIndex: 35,
    });
    expect(pagesDe(etat)[1]).toContain("s2");
  });

  it("annuler un glisser (GRILLE_REMPLACER avec les pages) remet aussi les pages", () => {
    const depart = etatDe(32);
    const apres = versPage(depart, "s3", 1, 0);
    const annule = reduire(apres, {
      type: A.GRILLE_REMPLACER,
      grille: depart.grille,
      pages: comptesDe(depart),
    });
    expect(pagesDe(annule)).toEqual(pagesDe(depart));
    expect(annule.reglages.pagesAccueil).toBeUndefined();
  });

  it("grille plus petite : chaque page trop pleine déborde sur la suivante", () => {
    let etat = versPage(etatDe(40), "s3", 1, 0); // [31, 9]
    etat = reduire(etat, {
      type: A.REGLAGES_MODIFIER,
      changements: { grilleAccueil: { lignes: 3, colonnes: 8 } },
    });
    expect(pagesDe(etat).map((p) => p.length)).toEqual([24, 16]);
  });

  it("chargement : des pages incohérentes (autre appareil) sont corrigées", () => {
    const { etat } = migrer(etatDe(35, { pages: [10, 40] }));
    expect(comptesDe(etat)).toEqual([10, 25]);
    expect(etat.reglages.pagesAccueil).toEqual([10, 25]);
  });
});

describe("propriété : pages enregistrées", () => {
  it("2 000 opérations aléatoires : rien de perdu, pages valides, stockées seulement si utile", () => {
    let graine = 11;
    const hasard = (n) => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return Math.floor((graine / 2147483648) * n);
    };
    let etat = etatDe(50, { lignes: 2, colonnes: 5 });
    const attendus = new Set(etat.grille.map((e) => e.id));
    let n = 1000;
    for (let i = 0; i < 2000; i++) {
      const ids = etat.grille.map((e) => e.id);
      const comptes = comptesDe(etat);
      const op = hasard(6);
      if (op <= 2 && ids.length) {
        etat = versPage(etat, ids[hasard(ids.length)], hasard(comptes.length + 1), hasard(12));
      } else if (op === 3) {
        const id = `n${n++}`;
        attendus.add(id);
        etat = reduire(etat, { type: A.SITE_AJOUTER, site: site(id), parentId: null });
      } else if (op === 4 && ids.length > 1) {
        const id = ids[hasard(ids.length)];
        attendus.delete(id);
        etat = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id });
      } else {
        etat = reduire(etat, {
          type: A.REGLAGES_MODIFIER,
          changements: { grilleAccueil: { lignes: 1 + hasard(4), colonnes: 2 + hasard(6) } },
        });
      }
      const apres = comptesDe(etat);
      const { lignes, colonnes } = etat.reglages.grilleAccueil;
      expect(apres.reduce((s, c) => s + c, 0)).toBe(etat.grille.length);
      expect(apres.every((c) => c >= 1 && c <= lignes * colonnes)).toBe(true);
      expect(new Set(etat.grille.map((e) => e.id))).toEqual(attendus);
      if (etat.reglages.pagesAccueil)
        expect(etat.reglages.pagesAccueil).not.toEqual(
          comptesParDefaut(etat.grille.length, lignes * colonnes),
        );
    }
  });
});
