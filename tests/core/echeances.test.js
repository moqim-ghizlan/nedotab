import { describe, expect, it } from "vitest";
import {
  ajouterJours,
  bornesSemaine,
  compareJours,
  compterEnRetard,
  formaterEcheanceCourte,
  grouperAujourdhui,
  joursEntre,
  jourLocal,
  libelleEcheance,
  lundiProchain,
  msAvantMinuit,
  statutEcheance,
} from "../../src/core/echeances.js";

// Dates built from local components, like the app does: the tests do not depend on the time zone.
const le = (a, m, j, h = 12, mn = 0) => new Date(a, m - 1, j, h, mn);

describe("jourLocal / calendrier", () => {
  it("prend les composantes locales, jamais l'UTC", () => {
    expect(jourLocal(le(2026, 11, 5, 0, 5))).toBe("2026-11-05");
    expect(jourLocal(le(2026, 11, 5, 23, 59))).toBe("2026-11-05");
  });
  it("ajouterJours : fin de mois, fin d'année, 29 février", () => {
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29");
    expect(ajouterJours("2027-02-28", 1)).toBe("2027-03-01");
    expect(ajouterJours("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("joursEntre traverse un changement d'heure sans décalage", () => {
    expect(joursEntre("2026-03-28", "2026-03-30")).toBe(2);
    expect(joursEntre("2026-10-24", "2026-10-26")).toBe(2);
    expect(joursEntre("2026-11-05", "2026-11-04")).toBe(-1);
  });
  it("compareJours", () => {
    expect(compareJours("2026-01-01", "2026-01-02")).toBeLessThan(0);
    expect(compareJours("2026-01-02", "2026-01-01")).toBeGreaterThan(0);
    expect(compareJours("2026-01-01", "2026-01-01")).toBe(0);
    expect(compareJours("", "2026-01-01")).toBeGreaterThan(0);
  });
});

describe("semaine commençant le lundi", () => {
  it("bornes d'un mercredi, d'un lundi et d'un dimanche", () => {
    expect(bornesSemaine("2026-11-04")).toEqual({ debut: "2026-11-02", fin: "2026-11-08" });
    expect(bornesSemaine("2026-11-02")).toEqual({ debut: "2026-11-02", fin: "2026-11-08" });
    expect(bornesSemaine("2026-11-08")).toEqual({ debut: "2026-11-02", fin: "2026-11-08" });
  });
  it("lundi prochain", () => {
    expect(lundiProchain("2026-11-04")).toBe("2026-11-09");
    expect(lundiProchain("2026-11-02")).toBe("2026-11-09");
    expect(lundiProchain("2026-11-08")).toBe("2026-11-09");
  });
});

describe("libelleEcheance / statutEcheance", () => {
  const now = le(2026, 11, 5);
  it("aujourd'hui, demain, hier", () => {
    expect(libelleEcheance("2026-11-05", now)).toBe("Aujourd'hui");
    expect(libelleEcheance("2026-11-06", now)).toBe("Demain");
    expect(libelleEcheance("2026-11-04", now)).toBe("Hier");
  });
  it("retard et dans N jours, puis une date", () => {
    expect(libelleEcheance("2026-11-03", now)).toBe("En retard de 2 jours");
    expect(libelleEcheance("2026-11-08", now)).toBe("Dans 3 jours");
    expect(libelleEcheance("2026-11-12", now)).toBe("Dans 7 jours");
    expect(libelleEcheance("2026-11-20", now)).toBe("20 nov.");
    expect(libelleEcheance("2027-01-10", now)).toBe("10 janv. 2027");
    expect(libelleEcheance(null, now)).toBe("");
  });
  it("statuts", () => {
    expect(statutEcheance("2026-11-04", now)).toBe("retard");
    expect(statutEcheance("2026-11-05", now)).toBe("aujourdhui");
    expect(statutEcheance("2026-11-06", now)).toBe("demain");
    expect(statutEcheance("2026-11-08", now)).toBe("semaine");
    expect(statutEcheance("2026-11-09", now)).toBe("plus-tard");
    expect(statutEcheance(null, now)).toBe("aucune");
    expect(statutEcheance("2026-02-30", now)).toBe("aucune");
  });
  it("à 23:59 puis 00:01 le libellé change", () => {
    expect(libelleEcheance("2026-11-06", le(2026, 11, 5, 23, 59))).toBe("Demain");
    expect(libelleEcheance("2026-11-06", le(2026, 11, 6, 0, 1))).toBe("Aujourd'hui");
  });
  it("29 février et fin d'année", () => {
    expect(libelleEcheance("2028-02-29", le(2028, 2, 28))).toBe("Demain");
    expect(libelleEcheance("2027-01-01", le(2026, 12, 31))).toBe("Demain");
  });
  it("date courte", () => {
    expect(formaterEcheanceCourte("2026-11-12", now)).toBe("12 nov.");
    expect(formaterEcheanceCourte("pas une date", now)).toBe("");
  });
});

describe("minuit et groupes", () => {
  it("millisecondes avant minuit", () => {
    expect(msAvantMinuit(le(2026, 11, 5, 23, 59))).toBe(60_000);
    expect(msAvantMinuit(le(2026, 11, 5, 0, 0))).toBeGreaterThan(20 * 3_600_000);
  });
  it("répartit en retard, aujourd'hui, demain, cette semaine ; ignore faits et sans date", () => {
    const now = le(2026, 11, 4);
    const t = (id, echeance, fait = false) => ({ id, echeance, fait, ordre: 1 });
    const g = grouperAujourdhui(
      [
        t("a", "2026-11-01"),
        t("b", "2026-11-04"),
        t("c", "2026-11-05"),
        t("d", "2026-11-07"),
        t("e", "2026-11-20"),
        t("f", null),
        t("g", "2026-11-01", true),
      ],
      now,
    );
    expect(g.map((x) => [x.id, x.todos.map((y) => y.id)])).toEqual([
      ["retard", ["a"]],
      ["aujourdhui", ["b"]],
      ["demain", ["c"]],
      ["semaine", ["d"]],
    ]);
    expect(
      compterEnRetard([t("a", "2026-11-01"), t("b", "2026-11-04"), t("g", "2026-11-01", true)], now),
    ).toBe(1);
  });
});
