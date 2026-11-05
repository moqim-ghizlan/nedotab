import { describe, expect, it } from "vitest";
import {
  APPAREILS_MAX,
  ajouterAppareil,
  appareilDepuisDoc,
  derniereActivite,
  libelleAppareilAffiche,
  nomParDefaut,
  renommerAppareil,
  retirerAppareil,
  validerNomAppareil,
} from "../../src/core/appareils.js";

const a = (id, nom, type = "extension") => ({ id, nom, type });

describe("nom d'appareil", () => {
  it("normalise les espaces", () => {
    expect(validerNomAppareil("  work   pc ")).toEqual({ ok: true, nom: "work pc" });
  });
  it("refuse vide, balises, contrôle, trop long", () => {
    expect(validerNomAppareil("  ").ok).toBe(false);
    expect(validerNomAppareil("<b>x</b>").ok).toBe(false);
    expect(validerNomAppareil("a\u0007b").ok).toBe(false);
    expect(validerNomAppareil("x".repeat(31)).ok).toBe(false);
    expect(validerNomAppareil("x".repeat(30)).ok).toBe(true);
  });
  it("doublon insensible à la casse et aux accents, sauf soi-même", () => {
    const liste = [a("1", "Maison"), a("2", "Travail")];
    expect(validerNomAppareil("maïson", liste).ok).toBe(false);
    expect(validerNomAppareil("MAISON", liste, "1").ok).toBe(true);
  });
  it("nom par défaut avec numéro", () => {
    expect(nomParDefaut("extension", [])).toBe("Chrome");
    expect(nomParDefaut("extension", [a("1", "Chrome")])).toBe("Chrome 2");
    expect(nomParDefaut("extension", [a("1", "chrome"), a("2", "Chrome 2")])).toBe("Chrome 3");
    expect(nomParDefaut("iphone", [])).toBe("iPhone");
  });
});

describe("liste d'appareils", () => {
  it("ajoute, renomme, retire", () => {
    let r = ajouterAppareil([], a("1", " Maison "));
    expect(r.liste[0].nom).toBe("Maison");
    r = renommerAppareil(r.liste, "1", "Salon");
    expect(r.liste[0].nom).toBe("Salon");
    expect(retirerAppareil(r.liste, "1", "1").ok).toBe(false);
    expect(retirerAppareil(r.liste, "1", "2").liste).toEqual([]);
  });
  it("liste pleine à 20", () => {
    const pleine = Array.from({ length: APPAREILS_MAX }, (_, i) => a(String(i), `N${i}`));
    expect(ajouterAppareil(pleine, a("x", "Nouveau")).ok).toBe(false);
    expect(ajouterAppareil(pleine, a("3", "N3")).ok).toBe(true); // already in the list
  });
  it("document invalide ignoré", () => {
    expect(appareilDepuisDoc("1", { nom: "" })).toBeNull();
    expect(appareilDepuisDoc("1", { nom: "Salon", type: "bizarre" }).type).toBe("navigateur");
  });
  it("dernière activité", () => {
    const t = Date.UTC(2026, 10, 5);
    expect(derniereActivite(t - 2 * 3_600_000, t)).toBe("il y a 2 h");
    expect(derniereActivite(t - 86_400_000 * 2, t)).toBe("il y a 2 j");
    expect(derniereActivite(undefined, t)).toBe("");
  });
});

describe("repli d'affichage sur 3 niveaux", () => {
  const liste = [a("1", "work-pc")];
  it("1) nom actuel par identifiant", () => {
    expect(libelleAppareilAffiche({ appareilId: "1", appareil: "ancien-nom" }, liste)).toBe("work-pc");
  });
  it("2) nom figé quand l'appareil a été retiré", () => {
    expect(libelleAppareilAffiche({ appareilId: "9", appareil: "vieux-pc" }, liste)).toBe("vieux-pc");
  });
  it("3) type pour les anciens éléments", () => {
    expect(libelleAppareilAffiche({ appareil: "extension" }, liste)).toBe("Chrome");
    expect(libelleAppareilAffiche({}, liste)).toBe("Autre appareil");
    expect(libelleAppareilAffiche(undefined, null)).toBe("Autre appareil");
  });
});
