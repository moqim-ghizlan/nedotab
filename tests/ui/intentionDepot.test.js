import { describe, expect, it } from "vitest";
import { dansZoneCentrale } from "../../src/ui/intentionDepot.js";

const rect = { left: 100, top: 200, right: 156, bottom: 256, width: 56, height: 56 };

describe("dansZoneCentrale", () => {
  it("le centre est dans la zone", () => {
    expect(dansZoneCentrale(rect, 128, 228)).toBe(true);
  });
  it("les bords de la zone centrale (50 %) sont inclus", () => {
    expect(dansZoneCentrale(rect, 114, 214)).toBe(true);
    expect(dansZoneCentrale(rect, 142, 242)).toBe(true);
  });
  it("juste à l'extérieur de la zone centrale", () => {
    expect(dansZoneCentrale(rect, 113.9, 228)).toBe(false);
    expect(dansZoneCentrale(rect, 142.1, 228)).toBe(false);
    expect(dansZoneCentrale(rect, 128, 213.9)).toBe(false);
    expect(dansZoneCentrale(rect, 128, 242.1)).toBe(false);
  });
  it("les coins de la tuile ne comptent pas", () => {
    expect(dansZoneCentrale(rect, 100, 200)).toBe(false);
    expect(dansZoneCentrale(rect, 156, 256)).toBe(false);
  });
  it("ratio personnalisé", () => {
    expect(dansZoneCentrale(rect, 105, 205, 1)).toBe(true);
  });
});
