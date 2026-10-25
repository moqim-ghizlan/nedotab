import { describe, expect, it } from "vitest";
import { reduire, A } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import {
  comptesDe,
  decouperParComptes,
  deplacementEntreEcrans,
  ecransDePages,
  grilleTelephone,
} from "../../src/core/pages.js";

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });

describe("pages sur téléphone (V3.4)", () => {
  it("grille du téléphone : 4 colonnes en portrait, 7 × 3 en paysage", () => {
    expect(grilleTelephone(375, 812)).toEqual({ lignes: 6, colonnes: 4 });
    expect(grilleTelephone(375, 667)).toEqual({ lignes: 5, colonnes: 4 }); // iPhone SE
    expect(grilleTelephone(812, 375)).toEqual({ lignes: 3, colonnes: 7 });
  });
  it("chaque page enregistrée est coupée en écrans, sans jamais changer les pages", () => {
    expect(ecransDePages([32, 5], 24)).toEqual([
      { page: 0, debut: 0, n: 24 },
      { page: 0, debut: 24, n: 8 },
      { page: 1, debut: 0, n: 5 },
    ]);
    expect(ecransDePages([32, 5], Infinity)).toEqual([
      { page: 0, debut: 0, n: 32 },
      { page: 1, debut: 0, n: 5 },
    ]);
    expect(ecransDePages([], 24)).toEqual([]);
  });
  it("un déplacement entre écrans devient une page et une position enregistrées", () => {
    const ecrans = ecransDePages([32, 5], 24);
    // Inside one screen, then to the second screen of the same page (forward: -1).
    expect(deplacementEntreEcrans(ecrans, 0, 0, 3)).toEqual({ versPage: 0, versIndex: 3 });
    expect(deplacementEntreEcrans(ecrans, 0, 1, 2)).toEqual({ versPage: 0, versIndex: 25 });
    expect(deplacementEntreEcrans(ecrans, 1, 0, 2)).toEqual({ versPage: 0, versIndex: 2 });
    expect(deplacementEntreEcrans(ecrans, 0, 2, 1)).toEqual({ versPage: 1, versIndex: 1 });
    // Past the last screen: a new page.
    expect(deplacementEntreEcrans(ecrans, 2, 3, 0)).toEqual({ versPage: 2, versIndex: 0 });
  });
  it("le réducteur place l'élément là où il a été déposé sur le téléphone", () => {
    const ids = Array.from({ length: 32 }, (_, i) => `s${i}`);
    const etat = { ...etatInitial(), grille: ids.map(site) };
    const ecrans = ecransDePages(comptesDe(etat), 24); // [24, 8] of the single page
    // s0 (screen 0) dropped at position 2 of screen 1: after s24 and s25.
    const vers = deplacementEntreEcrans(ecrans, 0, 1, 2);
    const apres = reduire(etat, { type: A.ELEMENT_DEPLACER, id: "s0", ...vers });
    const page = decouperParComptes(apres.grille, comptesDe(apres))[0].map((e) => e.id);
    const i = page.indexOf("s0");
    expect(page.slice(i - 2, i + 2)).toEqual(["s24", "s25", "s0", "s26"]);
  });
});
