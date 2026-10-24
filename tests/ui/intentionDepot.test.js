import { describe, expect, it } from "vitest";
import {
  dansZoneCentrale,
  recouvrement,
  SEUIL_RECOUVREMENT,
  zoneCapture,
} from "../../src/ui/intentionDepot.js";

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

const boite = (left, top, cote = 70) => ({
  left,
  top,
  right: left + cote,
  bottom: top + cote,
  width: cote,
  height: cote,
});

describe("recouvrement (icône glissée sur l'icône cible)", () => {
  const cible = boite(60, 10);
  it("exactement dessus : 100 %", () => {
    expect(recouvrement(boite(60, 10), cible)).toBe(1);
  });
  it("décalée vers le bas à gauche comme sur la capture : ~33 %, au-dessus du seuil de 20 %", () => {
    expect(recouvrement(boite(30, 40), cible)).toBeCloseTo(0.33, 2);
    expect(recouvrement(boite(30, 40), cible)).toBeGreaterThanOrEqual(0.2);
  });
  it("juste à côté ou disjointe : 0", () => {
    expect(recouvrement(boite(130, 10), cible)).toBe(0);
    expect(recouvrement(boite(500, 500), cible)).toBe(0);
  });
  it("cible de taille nulle : 0", () => {
    expect(recouvrement(boite(60, 10), boite(60, 10, 0))).toBe(0);
  });
});

describe("zone de capture (icône + 25 % de marge)", () => {
  const cible = boite(100, 100, 56); // 56 px icon
  it("agrandie de 14 px de chaque côté", () => {
    expect(zoneCapture(cible)).toMatchObject({ left: 86, top: 86, right: 170, bottom: 170 });
  });
  it("icône glissée décalée de 60 % en diagonale : encore captée", () => {
    const glissee = boite(100 - 0.6 * 56, 100 + 0.6 * 56, 56);
    expect(recouvrement(zoneCapture(cible), glissee)).toBeGreaterThanOrEqual(SEUIL_RECOUVREMENT);
  });
  it("icône glissée dans l'espace entre deux tuiles (64 px) : pas captée", () => {
    const glissee = boite(156 + 32 - 28, 100, 56); // centred in the gap after the target
    expect(recouvrement(zoneCapture(cible), glissee)).toBeLessThan(SEUIL_RECOUVREMENT);
  });
});
