import { describe, expect, it } from "vitest";
import {
  dateLongueMessage,
  formaterHeureMessage,
  grouperParJour,
  heureVisible,
  libelleJour,
} from "../../src/core/conversations.js";

const t = (a, m, j, h = 12, mi = 0, s = 0) => new Date(a, m - 1, j, h, mi, s).getTime();
const NOW = t(2026, 11, 5, 15, 0);

describe("heure des messages", () => {
  it("même jour, hier, ancien, autre année", () => {
    expect(formaterHeureMessage(t(2026, 11, 5, 14, 32), NOW)).toBe("14:32");
    expect(formaterHeureMessage(t(2026, 11, 4, 23, 59), NOW)).toBe("hier 23:59");
    expect(formaterHeureMessage(t(2026, 10, 28, 14, 32), NOW)).toMatch(/28 oct\.?, 14:32$/);
    expect(formaterHeureMessage(t(2025, 10, 28, 14, 32), NOW)).toBe("28 oct. 2025, 14:32");
  });
  it("autour de minuit", () => {
    expect(formaterHeureMessage(t(2026, 11, 5, 0, 1), t(2026, 11, 5, 0, 2))).toBe("00:01");
    expect(formaterHeureMessage(t(2026, 11, 4, 23, 59), t(2026, 11, 5, 0, 1))).toBe("hier 23:59");
  });
  it("12 h / 24 h", () => {
    expect(formaterHeureMessage(t(2026, 11, 5, 14, 32), NOW, { format24h: false })).toBe("2:32 PM");
    expect(formaterHeureMessage(t(2026, 11, 5, 0, 5), NOW, { format24h: false })).toBe("12:05 AM");
  });
  it("date absente", () => {
    expect(formaterHeureMessage(undefined, NOW)).toBe("");
    expect(dateLongueMessage(null)).toBe("");
    expect(libelleJour(NaN, NOW)).toBe("");
  });
  it("date longue", () => {
    expect(dateLongueMessage(t(2026, 11, 4, 14, 32, 7))).toMatch(/mercredi 4 novembre 2026.*14:32:07/);
  });
  it("libellés de jour", () => {
    expect(libelleJour(t(2026, 11, 5, 8), NOW)).toBe("Aujourd'hui");
    expect(libelleJour(t(2026, 11, 4, 8), NOW)).toBe("Hier");
    expect(libelleJour(t(2025, 1, 4, 8), NOW)).toMatch(/2025/);
  });
  it("grouperParJour", () => {
    const g = grouperParJour(
      [
        { id: 1, date: t(2026, 11, 4, 9) },
        { id: 2, date: t(2026, 11, 4, 10) },
        { id: 3, date: t(2026, 11, 5, 9) },
        { id: 4 },
      ],
      NOW,
    );
    expect(g.map((x) => [x.libelle, x.messages.length])).toEqual([["Hier", 2], ["Aujourd'hui", 2]]);
  });
  it("l'heure n'est pas répétée dans la même minute pour un même auteur", () => {
    const a = { role: "user", date: t(2026, 11, 5, 9, 0, 5) };
    const b = { role: "user", date: t(2026, 11, 5, 9, 0, 40) };
    const c = { role: "assistant", date: t(2026, 11, 5, 9, 0, 50) };
    expect(heureVisible(a, b)).toBe(false);
    expect(heureVisible(b, c)).toBe(true);
    expect(heureVisible({ role: "user" }, null)).toBe(false);
  });
});
