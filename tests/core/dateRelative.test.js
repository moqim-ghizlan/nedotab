import { describe, expect, it } from "vitest";
import { dateRelative } from "../../src/core/sauvegardes.js";

describe("dateRelative (V3.8)", () => {
  const maintenant = new Date(2026, 9, 26, 15, 0).getTime();
  const le = (j, m, a, h = 9, mi = 12) => new Date(a, m, j, h, mi).getTime();

  it("aujourd'hui, même tôt le matin", () => {
    expect(dateRelative(le(26, 9, 2026, 0, 5), maintenant)).toBe("Aujourd'hui 00:05");
    expect(dateRelative(le(26, 9, 2026, 14, 35), maintenant)).toBe("Aujourd'hui 14:35");
  });
  it("hier, même à 23:59 (jour civil, pas 24 h)", () => {
    expect(dateRelative(le(25, 9, 2026, 9, 12), maintenant)).toBe("Hier 09:12");
    expect(dateRelative(le(25, 9, 2026, 23, 59), maintenant)).toBe("Hier 23:59");
  });
  it("plus ancien : date complète", () => {
    expect(dateRelative(le(18, 9, 2026), maintenant)).toBe("18/10/2026");
  });
  it("changement d'année : le 31/12 est « Hier » le 1er janvier", () => {
    const nouvelAn = new Date(2027, 0, 1, 10, 0).getTime();
    expect(dateRelative(le(31, 11, 2026, 22, 0), nouvelAn)).toBe("Hier 22:00");
    expect(dateRelative(le(30, 11, 2026), nouvelAn)).toBe("30/12/2026");
  });
});
