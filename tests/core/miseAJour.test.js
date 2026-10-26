import { describe, expect, it } from "vitest";
import {
  INTERVALLE_VERIFICATION_MS,
  doitVerifier,
  peutRecharger,
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
