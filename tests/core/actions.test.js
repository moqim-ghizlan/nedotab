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
