import { describe, expect, it } from "vitest";
import {
  INTERVALLE_VERIFICATION_MS,
  doitVerifier,
  peutRecharger,
  raisonOccupe,
} from "../../src/core/miseAJour.js";

const libre = { fenetreOuverte: false, glisserEnCours: false, saisieEnCours: false };

describe("peutRecharger", () => {
  it("oui quand rien n'est en cours", () => {
    expect(peutRecharger(libre)).toBe(true);
  });
  it.each(["fenetreOuverte", "glisserEnCours", "saisieEnCours"])("non si %s", (cle) => {
    expect(peutRecharger({ ...libre, [cle]: true })).toBe(false);
  });
});

describe("doitVerifier", () => {
  it("au plus une fois par heure", () => {
    expect(doitVerifier(0, INTERVALLE_VERIFICATION_MS - 1)).toBe(false);
    expect(doitVerifier(0, INTERVALLE_VERIFICATION_MS)).toBe(true);
  });
});

describe("raisonOccupe", () => {
  const libre = { fenetreOuverte: false, glisserEnCours: false, saisieEnCours: false };
  it("null quand rien n'est en cours", () => {
    expect(raisonOccupe(libre)).toBeNull();
  });
  it("une raison par situation, la fenêtre d'abord", () => {
    expect(raisonOccupe({ ...libre, saisieEnCours: true })).toBe("saisie");
    expect(raisonOccupe({ ...libre, glisserEnCours: true })).toBe("glisser");
    expect(raisonOccupe({ ...libre, fenetreOuverte: true, saisieEnCours: true })).toBe("fenetre");
  });
  it("cohérente avec peutRecharger", () => {
    for (const cle of ["fenetreOuverte", "glisserEnCours", "saisieEnCours"]) {
      const c = { ...libre, [cle]: true };
      expect(peutRecharger(c)).toBe(raisonOccupe(c) === null);
    }
  });
});
