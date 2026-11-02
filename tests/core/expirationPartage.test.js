import { describe, expect, it } from "vitest";
import {
  DUREES,
  ILLIMITE,
  HEURE,
  JOUR,
  MINUTE,
  VIE_MAX_MS,
  calculerExpiration,
  dureesProlongeables,
  ecartDepuisConfirmation,
  estExpire,
  expirationValide,
  formaterTempsRestant,
  libelleExpiration,
  prolonger,
  sansExpiration,
  tempsRestantMs,
} from "../../src/core/expirationPartage.js";

const T0 = Date.UTC(2026, 10, 2, 12, 0, 0);

describe("durées", () => {
  it.each(DUREES)("calcule l'échéance de $id", (d) => {
    expect(calculerExpiration(d.id, 0, T0)).toBe(d.ms === null ? ILLIMITE : T0 + d.ms);
  });
  it("une durée inconnue retombe sur 1 jour ; « jamais » donne l'échéance illimitée", () => {
    expect(calculerExpiration("inconnue", 0, T0)).toBe(T0 + JOUR);
    expect(calculerExpiration("jamais", 0, T0)).toBe(ILLIMITE);
    expect(expirationValide(ILLIMITE, T0)).toBe(true);
    expect(prolonger({ creeLe: T0, expireLe: T0 + JOUR }, "jamais", 0, T0)).toEqual({ ok: true, expireLe: ILLIMITE });
    expect(prolonger({ creeLe: T0, expireLe: ILLIMITE }, "jamais", 0, T0).ok).toBe(false);
  });
  it("bornes des règles : 59 min refusé, 55 min accepté, 31 jours accepté, 31 j + 1 min refusé", () => {
    expect(expirationValide(T0 + 54 * MINUTE, T0)).toBe(false);
    expect(expirationValide(T0 + 56 * MINUTE, T0)).toBe(true);
    expect(expirationValide(T0 + 31 * JOUR, T0)).toBe(true);
    expect(expirationValide(T0 + 31 * JOUR + MINUTE, T0)).toBe(false);
    expect(expirationValide(undefined, T0)).toBe(false);
  });
});

describe("horloge de l'appareil décalée de ±3 h", () => {
  it.each([3 * HEURE, -3 * HEURE])(
    "décalage %i : élément de 1 h ni déjà expiré ni affiché trop longtemps",
    (decalage) => {
      const serveur = T0;
      const appareil = serveur + decalage;
      const ecart = serveur - appareil; // learnt from a confirmed item
      expect(ecartDepuisConfirmation(serveur, appareil)).toBe(ecart);
      const e = { expireLe: calculerExpiration("1h", ecart, appareil) };
      expect(e.expireLe).toBe(serveur + HEURE);
      expect(estExpire(e, ecart, appareil)).toBe(false);
      // 61 minutes later (server time) the item is over, on the same wrong device clock
      expect(estExpire(e, ecart, appareil + 61 * MINUTE)).toBe(true);
      expect(estExpire(e, ecart, appareil + 59 * MINUTE)).toBe(false);
    },
  );
  it("un élément sans échéance n'expire jamais côté client (legacy)", () => {
    expect(estExpire({}, 0, T0)).toBe(false);
    expect(sansExpiration([{}, { expireLe: 5 }])).toHaveLength(1);
  });
});

describe("temps restant", () => {
  it.each([
    [30_000, "moins d'1 min"],
    [4 * MINUTE, "4 min"],
    [2 * HEURE + 10 * MINUTE, "2 h 10"],
    [3 * HEURE, "3 h"],
    [3 * JOUR + 5 * HEURE, "3 j"],
  ])("%i ms → %s", (ms, texte) => expect(formaterTempsRestant(ms)).toBe(texte));

  it("orange sous 15 min, avec du texte", () => {
    expect(libelleExpiration({ expireLe: T0 + 14 * MINUTE }, 0, T0)).toEqual({
      texte: "expire dans 14 min",
      urgent: true,
    });
    expect(libelleExpiration({ expireLe: T0 + 3 * HEURE }, 0, T0)).toEqual({
      texte: "expire dans 3 h",
      urgent: false,
    });
    expect(tempsRestantMs({ expireLe: T0 - 1 }, 0, T0)).toBe(0);
  });
});

describe("prolongation", () => {
  const e = (creeLe, expireLe) => ({ creeLe, expireLe });
  it("prolonge à partir de maintenant", () => {
    const r = prolonger(e(T0, T0 + HEURE), "1j", 0, T0);
    expect(r).toEqual({ ok: true, expireLe: T0 + JOUR });
  });
  it("plafonne à 30 jours après la création, puis refuse", () => {
    const vieux = e(T0 - 20 * JOUR, T0 + JOUR);
    expect(prolonger(vieux, "30j", 0, T0)).toEqual({
      ok: true,
      expireLe: T0 - 20 * JOUR + VIE_MAX_MS,
    });
    const plafonne = e(T0 - 20 * JOUR, T0 - 20 * JOUR + VIE_MAX_MS);
    expect(prolonger(plafonne, "7j", 0, T0)).toEqual({
      ok: false,
      erreur: "Durée maximale atteinte",
    });
    expect(dureesProlongeables(plafonne, 0, T0).map((d) => d.id)).toEqual(["jamais"]);
  });
  it("ne raccourcit jamais", () => {
    expect(prolonger(e(T0, T0 + 7 * JOUR), "1h", 0, T0).ok).toBe(false);
  });
});
