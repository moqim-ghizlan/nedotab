import { describe, expect, it } from "vitest";
import { DELAI_APPUI_LONG_MS, SEUIL_MOUVEMENT_PX, etatGeste } from "../../src/ui/appuiLong.js";

describe("etatGeste", () => {
  it("attend tant que le doigt est immobile avant le délai", () => {
    expect(etatGeste({ dureeMs: 100, deplacementPx: 2 })).toBe("attente");
  });
  it("un mouvement avant le délai est un défilement", () => {
    expect(etatGeste({ dureeMs: 100, deplacementPx: SEUIL_MOUVEMENT_PX + 1 })).toBe("defilement");
  });
  it("immobile après le délai : menu", () => {
    expect(etatGeste({ dureeMs: DELAI_APPUI_LONG_MS, deplacementPx: 0 })).toBe("menu");
  });
  it("mouvement après le délai : glisser", () => {
    expect(etatGeste({ dureeMs: DELAI_APPUI_LONG_MS + 50, deplacementPx: 20 })).toBe("glisser");
  });
  it("le seuil exact reste immobile", () => {
    expect(etatGeste({ dureeMs: 500, deplacementPx: SEUIL_MOUVEMENT_PX })).toBe("menu");
  });
});
