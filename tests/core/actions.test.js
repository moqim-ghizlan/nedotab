import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { exemple } from "../../src/core/exemple.js";
import { creerSite, etatInitial } from "../../src/core/modele.js";

const etatExemple = () => ({ ...etatInitial(), grille: exemple() });

describe("reduire", () => {
  it("ne mute pas l'état d'entrée", () => {
    const etat = etatExemple();
    const avant = structuredClone(etat);
    reduire(etat, { type: A.SITE_AJOUTER, site: creerSite({ titre: "N", url: "https://n.fr" }) });
    expect(etat).toEqual(avant);
  });
  it("SITE_AJOUTER ajoute à la fin ou à un index", () => {
    const site = creerSite({ titre: "N", url: "https://n.fr" }, () => "n");
    expect(reduire(etatExemple(), { type: A.SITE_AJOUTER, site }).grille.at(-1).id).toBe("n");
    expect(reduire(etatExemple(), { type: A.SITE_AJOUTER, site, index: 0 }).grille[0].id).toBe("n");
  });
  it("action inconnue : même référence", () => {
    const etat = etatExemple();
    expect(reduire(etat, { type: "X" })).toBe(etat);
  });
});

describe("modification et suppression", () => {
  it("SITE_MODIFIER ignore les champs non autorisés", () => {
    const etat = etatExemple();
    const id = etat.grille[0].id;
    const r = reduire(etat, {
      type: A.SITE_MODIFIER,
      id,
      changements: { titre: "Nouveau", type: "dossier", id: "pirate", creeLe: 5 },
    });
    expect(r.grille[0]).toMatchObject({ id, type: "site", titre: "Nouveau", creeLe: 0 });
    expect(reduire(etat, { type: A.SITE_MODIFIER, id, changements: { id: "x" } })).toBe(etat);
  });
  it("ELEMENT_SUPPRIMER puis ELEMENT_RESTAURER redonne exactement l'état", () => {
    const etat = etatExemple();
    const element = etat.grille[3];
    const sans = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: element.id });
    expect(sans.grille).toHaveLength(etat.grille.length - 1);
    const avec = reduire(sans, { type: A.ELEMENT_RESTAURER, element, parentId: null, index: 3 });
    expect(avec).toEqual(etat);
  });
  it("ELEMENT_RESTAURER : index hors bornes et dossier disparu", () => {
    const etat = etatExemple();
    const site = creerSite({ titre: "N", url: "https://n.fr" }, () => "n");
    const r = reduire(etat, {
      type: A.ELEMENT_RESTAURER,
      element: site,
      parentId: "absent",
      index: 999,
    });
    expect(r.grille.at(-1).id).toBe("n");
  });
  it("suppression d'un id inconnu : même état", () => {
    const etat = etatExemple();
    expect(reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: "zz" })).toBe(etat);
  });
});
