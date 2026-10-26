import { describe, expect, it } from "vitest";
import {
  apresConsommation,
  consommer,
  jourParis,
  QuotaDepasse,
} from "../../functions/src/quota.js";
import { baseMemoire } from "./baseMemoire.js";

describe("jourParis", () => {
  it("le jour change à minuit à Paris, pas à minuit UTC", () => {
    // 22:30 UTC en hiver = 23:30 à Paris ; 23:30 UTC = 00:30 le lendemain.
    expect(jourParis(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-10");
    expect(jourParis(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
    // En été (UTC+2) : 22:30 UTC = 00:30 le lendemain.
    expect(jourParis(new Date("2026-07-10T22:30:00Z"))).toBe("2026-07-11");
  });
});

describe("apresConsommation", () => {
  it("premier appel du jour", () => {
    expect(apresConsommation(undefined, { jour: "2026-10-26", limite: 300 })).toEqual({
      jour: "2026-10-26",
      appels: 1,
    });
  });
  it("nouveau jour : remise à zéro", () => {
    expect(
      apresConsommation({ jour: "2026-10-25", appels: 300 }, { jour: "2026-10-26", limite: 300 }),
    ).toEqual({ jour: "2026-10-26", appels: 1 });
  });
  it("au-delà de la limite : refusé, avec le message prévu", () => {
    expect(() =>
      apresConsommation({ jour: "2026-10-26", appels: 300 }, { jour: "2026-10-26", limite: 300 }),
    ).toThrow(QuotaDepasse);
    expect(() =>
      apresConsommation({ jour: "2026-10-26", appels: 300 }, { jour: "2026-10-26", limite: 300 }),
    ).toThrow("Limite quotidienne atteinte (300 appels). Elle se réinitialise à minuit.");
  });
  it("la dernière unité passe", () => {
    expect(
      apresConsommation({ jour: "2026-10-26", appels: 299 }, { jour: "2026-10-26", limite: 300 })
        .appels,
    ).toBe(300);
  });
});

describe("consommer (transaction)", () => {
  it("10 appels simultanés pour une limite de 5 : exactement 5 acceptés", async () => {
    const db = baseMemoire();
    const resultats = await Promise.allSettled(
      Array.from({ length: 10 }, () => consommer(db, "u1", { limite: 5 })),
    );
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(resultats.filter((r) => r.reason instanceof QuotaDepasse)).toHaveLength(5);
    expect(db.lire("users/u1/prive/quota").appels).toBe(5);
  });
});
