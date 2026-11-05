import { describe, expect, it } from "vitest";
import {
  DUREES,
  ILLIMITE,
  HEURE,
  JOUR,
  MINUTE,
  calculerExpiration,
  dureesProlongeables,
  ecartDepuisConfirmation,
  estExpire,
  expirationValide,
  formaterTempsRestant,
  libelleExpiration,
  nouvelleExpiration,
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
    expect(prolonger({ creeLe: T0, expireLe: ILLIMITE }, "1h", 0, T0)).toEqual({ ok: true, expireLe: T0 + HEURE });
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
  it("un élément créé il y a 29 jours reste prolongeable", () => {
    const vieux = e(T0 - 29 * JOUR, T0 + JOUR);
    expect(prolonger(vieux, "30j", 0, T0)).toEqual({ ok: true, expireLe: T0 + 30 * JOUR });
  });
  it("peut raccourcir, ou repasser d'illimité à fini", () => {
    expect(prolonger(e(T0, T0 + 7 * JOUR), "1h", 0, T0)).toEqual({ ok: true, expireLe: T0 + HEURE });
    expect(prolonger(e(T0, ILLIMITE), "7j", 0, T0)).toEqual({ ok: true, expireLe: T0 + 7 * JOUR });
  });
  it("refuse la durée identique", () => {
    expect(prolonger(e(T0, T0 + HEURE), "1h", 0, T0).ok).toBe(false);
    expect(dureesProlongeables(e(T0, T0 + HEURE), 0, T0).map((d) => d.id)).not.toContain("1h");
  });
});

describe("nouvelleExpiration (modification d'un élément, T4)", () => {
  const elt = (expireLe, creeLe = T0) => ({ expireLe, creeLe });

  it("garder : rien ne change", () => {
    const r = nouvelleExpiration(elt(T0 + 3 * HEURE), { mode: "garder" }, 0, T0);
    expect(r).toEqual({ ok: true, expireLe: T0 + 3 * HEURE, change: false });
  });
  it("depuis maintenant : prolonge à partir de maintenant", () => {
    const r = nouvelleExpiration(elt(T0 + HEURE), { mode: "depuis-maintenant", duree: "1j" }, 0, T0);
    expect(r).toEqual({ ok: true, expireLe: T0 + JOUR, change: true });
  });
  it("depuis maintenant : peut raccourcir", () => {
    const r = nouvelleExpiration(elt(T0 + 7 * JOUR), { mode: "depuis-maintenant", duree: "1h" }, 0, T0);
    expect(r).toEqual({ ok: true, expireLe: T0 + HEURE, change: true });
  });
  it("depuis maintenant : identique ⇒ change false", () => {
    const r = nouvelleExpiration(elt(T0 + HEURE), { mode: "depuis-maintenant", duree: "1h" }, 0, T0);
    expect(r.change).toBe(false);
  });
  it("depuis maintenant : sort d'illimité", () => {
    const r = nouvelleExpiration(elt(ILLIMITE), { mode: "depuis-maintenant", duree: "30j" }, 0, T0);
    expect(r).toEqual({ ok: true, expireLe: T0 + 30 * JOUR, change: true });
  });
  it("ajouter : ajoute à l'échéance actuelle", () => {
    const r = nouvelleExpiration(elt(T0 + 2 * HEURE), { mode: "ajouter", duree: "1j" }, 0, T0);
    expect(r).toEqual({ ok: true, expireLe: T0 + 2 * HEURE + JOUR, change: true });
  });
  it("ajouter : plafonne à 30 jours depuis maintenant, puis refuse", () => {
    const a = nouvelleExpiration(elt(T0 + 20 * JOUR), { mode: "ajouter", duree: "30j" }, 0, T0);
    expect(a).toEqual({ ok: true, expireLe: T0 + 30 * JOUR, change: true });
    const b = nouvelleExpiration(elt(T0 + 30 * JOUR), { mode: "ajouter", duree: "1h" }, 0, T0);
    expect(b.ok).toBe(false);
  });
  it("illimité : permis depuis un élément fini ; « ajouter » sur illimité refusé", () => {
    const a = nouvelleExpiration(elt(T0 + HEURE), { mode: "ajouter", duree: "jamais" }, 0, T0);
    expect(a).toEqual({ ok: true, expireLe: ILLIMITE, change: true });
    const r = nouvelleExpiration(elt(ILLIMITE), { mode: "ajouter", duree: "1j" }, 0, T0);
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("illimité");
  });
  it("suit l'horloge du serveur (appareil décalé)", () => {
    const ecart = 3 * HEURE;
    const r = nouvelleExpiration(elt(T0 + HEURE), { mode: "depuis-maintenant", duree: "1j" }, ecart, T0);
    expect(r.expireLe).toBe(T0 + ecart + JOUR);
  });
  it("durée inconnue refusée", () => {
    expect(nouvelleExpiration(elt(T0 + HEURE), { mode: "ajouter", duree: "x" }, 0, T0).ok).toBe(false);
  });
});
