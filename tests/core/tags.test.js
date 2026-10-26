import { describe, expect, it } from "vitest";
import {
  champsEnrichissement,
  cleTag,
  DESCRIPTION_MAX,
  decouperTags,
  normaliserDescription,
  normaliserEtatIa,
  normaliserTag,
  normaliserTags,
  tagsUtilises,
} from "../../src/core/tags.js";

// Invisible characters are built from their code, never written in the file.
const car = (...codes) => String.fromCharCode(...codes);
const SANS_LARGEUR = car(8203); // zero-width space
const BEL = car(7);
const NUL = car(0);

describe("normaliserTag", () => {
  it.each([
    ["  Jeux Vidéo ", "jeux vidéo"],
    ["#Travail", "travail"],
    ["###  deux   espaces ", "deux espaces"],
    ["MAJUSCULES", "majuscules"],
    ["tab\tet\nretour", "tab et retour"],
    [`zéro${SANS_LARGEUR}width`, "zéro width"],
    [`ctrl${BEL}char`, "ctrl char"],
  ])("%j → %j", (entree, attendu) => {
    expect(normaliserTag(entree)).toBe(attendu);
  });

  it.each([[""], ["   "], ["#"], ["###"], [null], [undefined], [12], [{}]])("%j → null", (v) => {
    expect(normaliserTag(v)).toBeNull();
  });

  it("30 caractères au plus (31 coupé), sans couper un caractère en deux", () => {
    expect(normaliserTag("a".repeat(30))).toHaveLength(30);
    expect(normaliserTag("a".repeat(31))).toHaveLength(30);
    expect([...normaliserTag("😀".repeat(40))]).toHaveLength(30);
  });
});

describe("normaliserTags", () => {
  it("doublons sans tenir compte de la casse ni des accents ; garde la première écriture", () => {
    expect(normaliserTags(["Café", "cafe", "CAFÉ", "thé", "#the"])).toEqual(["café", "thé"]);
  });

  it("12 tags → 10 (les suivants ignorés)", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`);
    expect(normaliserTags(tags)).toEqual(tags.slice(0, 10));
  });

  it("les doublons ne comptent pas dans la limite de 10", () => {
    const tags = ["a", "A", "a", ...Array.from({ length: 12 }, (_, i) => `t${i}`)];
    const r = normaliserTags(tags);
    expect(r).toHaveLength(10);
    expect(r[0]).toBe("a");
  });

  it("entrées invalides : liste vide", () => {
    expect(normaliserTags(null)).toEqual([]);
    expect(normaliserTags("pas une liste")).toEqual([]);
    expect(normaliserTags([null, 3, "", "  ", "ok"])).toEqual(["ok"]);
  });

  it("idempotent", () => {
    const une = normaliserTags(["#Un", "Deux ", "trois", "un"]);
    expect(normaliserTags(une)).toEqual(une);
  });
});

describe("cleTag et decouperTags", () => {
  it("clé de comparaison sans accents ni casse", () => {
    expect(cleTag("Éléphant")).toBe("elephant");
  });
  it("découpe un texte collé", () => {
    expect(decouperTags("a, b;c\nd")).toEqual(["a", " b", "c", "d"]);
    expect(normaliserTags(decouperTags("jeux, #vidéo ; Jeux"))).toEqual(["jeux", "vidéo"]);
  });
});

describe("normaliserDescription", () => {
  it("espaces et retours à la ligne", () => {
    expect(normaliserDescription("  Un   texte \n\n\n avec  des \r\n lignes  ")).toBe(
      "Un texte\navec des\nlignes",
    );
  });
  it("caractères de contrôle supprimés, texte absent : chaîne vide", () => {
    expect(normaliserDescription(`a${NUL}b${BEL}c`)).toBe("a b c");
    expect(normaliserDescription(null)).toBe("");
    expect(normaliserDescription(42)).toBe("");
  });
  it("300 caractères : gardé tel quel", () => {
    const t = "x".repeat(DESCRIPTION_MAX);
    expect(normaliserDescription(t)).toBe(t);
  });
  it("plus de 300 : coupé proprement au dernier mot", () => {
    const mots = Array.from({ length: 80 }, () => "mot").join(" "); // 319 caractères
    const r = normaliserDescription(mots);
    expect(r.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(r.endsWith("mot")).toBe(true);
    expect(r.endsWith(" ")).toBe(false);
    expect(mots.startsWith(r)).toBe(true);
  });
  it("un très long mot sans espace : coupé à la limite", () => {
    expect(normaliserDescription("a".repeat(500))).toHaveLength(DESCRIPTION_MAX);
  });
  it("idempotent", () => {
    const r = normaliserDescription("  a   b \n\n c ".repeat(80));
    expect(normaliserDescription(r)).toBe(r);
  });
});

describe("état ia et champs d'un site", () => {
  it("état ia : valeurs par défaut et erreur seulement en cas d'échec", () => {
    expect(normaliserEtatIa(undefined)).toEqual({ etat: "aucun", majLe: null });
    expect(normaliserEtatIa({ etat: "inconnu", majLe: "x" })).toEqual({
      etat: "aucun",
      majLe: null,
    });
    expect(normaliserEtatIa({ etat: "ok", majLe: 5, erreur: "x" })).toEqual({
      etat: "ok",
      majLe: 5,
    });
    expect(normaliserEtatIa({ etat: "echec", majLe: 5, erreur: "délai" })).toEqual({
      etat: "echec",
      majLe: 5,
      erreur: "délai",
    });
  });
  it("un site ancien reçoit les quatre champs par défaut", () => {
    expect(champsEnrichissement({ id: "a" })).toEqual({
      tags: [],
      description: "",
      tagsManuels: false,
      ia: { etat: "aucun", majLe: null },
    });
  });
  it("tags utilisés dans la grille : tous les niveaux, les plus fréquents d'abord", () => {
    const grille = [
      { type: "site", tags: ["b", "a"] },
      { type: "dossier", items: [{ type: "site", tags: ["a"] }, { type: "site" }] },
    ];
    expect(tagsUtilises(grille)).toEqual(["a", "b"]);
  });
});
