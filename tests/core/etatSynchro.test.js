import { describe, expect, it } from "vitest";
import { etatIndicateur } from "../../src/core/etatSynchro.js";

describe("indicateur de synchro (8 cas)", () => {
  const cas = [
    // enLigne, depuisCache, enAttente → état
    [false, false, false, "hors-ligne"],
    [false, false, true, "hors-ligne"],
    [false, true, false, "hors-ligne"],
    [false, true, true, "hors-ligne"],
    [true, true, false, "hors-ligne"],
    [true, true, true, "hors-ligne"],
    [true, false, true, "attente"],
    [true, false, false, "synchronise"],
  ];
  for (const [enLigne, depuisCache, enAttente, attendu] of cas) {
    it(`en ligne ${enLigne}, cache ${depuisCache}, en attente ${enAttente} → ${attendu}`, () => {
      expect(etatIndicateur({ enLigne, depuisCache, enAttente })).toBe(attendu);
    });
  }
  it("une erreur prime sur le reste", () => {
    expect(
      etatIndicateur({ enLigne: true, depuisCache: false, enAttente: false, erreur: true }),
    ).toBe("erreur");
  });
});
