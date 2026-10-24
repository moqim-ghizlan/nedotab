import { describe, expect, it } from "vitest";
import { empreinte } from "../../src/core/empreinte.js";
import {
  aSupprimer,
  dateHeure,
  doitSauvegarder,
  idSauvegarde,
  JOUR_MS,
  nettoyerNom,
} from "../../src/core/sauvegardes.js";

const etat = (grille) => ({ grille, reglages: { theme: "auto" } });

describe("empreinte", () => {
  it("clés dans un autre ordre, dates de création différentes → même empreinte", () => {
    const a = {
      grille: [{ id: "a", titre: "A", url: "u", creeLe: 1 }],
      reglages: { theme: "auto", fond: { type: "aucun" } },
    };
    const b = {
      reglages: { fond: { type: "aucun" }, theme: "auto" },
      grille: [{ url: "u", creeLe: 99, titre: "A", id: "a" }],
    };
    expect(empreinte(a)).toBe(empreinte(b));
    expect(empreinte(a)).toMatch(/^[0-9a-f]{16}$/);
  });
  it("une modification change l'empreinte", () => {
    expect(empreinte(etat([{ id: "a" }]))).not.toBe(empreinte(etat([{ id: "b" }])));
  });
});

describe("faut-il sauvegarder ?", () => {
  const maintenant = 10 * JOUR_MS;
  const base = { etat: etat([{ id: "a" }]), empreinteActuelle: "x", maintenant };
  it("grille vide : non", () => {
    expect(doitSauvegarder({ ...base, etat: etat([]) })).toBe(false);
  });
  it("moins de 24 h : non", () => {
    expect(doitSauvegarder({ ...base, derniereAuto: maintenant - JOUR_MS + 1 })).toBe(false);
  });
  it("identique à la dernière : non", () => {
    expect(doitSauvegarder({ ...base, derniereAuto: 0, empreinteDerniere: "x" })).toBe(false);
  });
  it("cas normal et première fois : oui", () => {
    expect(
      doitSauvegarder({ ...base, derniereAuto: maintenant - JOUR_MS - 1, empreinteDerniere: "y" }),
    ).toBe(true);
    expect(doitSauvegarder({ ...base, derniereAuto: null })).toBe(true);
  });
});

describe("rotation", () => {
  it("35 auto + 5 manuelles → les 5 auto les plus anciennes, manuelles intactes", () => {
    const liste = [
      ...Array.from({ length: 35 }, (_, i) => ({ id: `a${i}`, type: "auto", creeLe: i })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, type: "manuelle", creeLe: -i })),
    ];
    expect(aSupprimer(liste, 30).sort()).toEqual(["a0", "a1", "a2", "a3", "a4"]);
  });
  it("avant-restauration limitées à 10", () => {
    const liste = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      type: "avant-restauration",
      creeLe: i,
    }));
    expect(aSupprimer(liste, 10, "avant-restauration").sort()).toEqual(["r0", "r1"]);
  });
});

describe("identifiant, nom, date", () => {
  it("identifiant chronologique", () => {
    const id = idSauvegarde(new Date(2026, 9, 21, 14, 35, 7), () => 0);
    expect(id).toBe("2026-10-21_143507_aaaa");
    expect(idSauvegarde(new Date(2026, 0, 1)) < idSauvegarde(new Date(2026, 0, 2))).toBe(true);
  });
  it("nom : 1 à 60 caractères ou null", () => {
    expect(nettoyerNom("  Avant   rangement ")).toBe("Avant rangement");
    expect(nettoyerNom("   ")).toBeNull();
    expect(nettoyerNom("x".repeat(200))).toHaveLength(60);
  });
  it("date et heure locales", () => {
    expect(dateHeure(new Date(2026, 9, 21, 14, 35).getTime())).toBe("21/10/2026 14:35");
  });
});
