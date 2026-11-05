import { describe, expect, it } from "vitest";
import {
  dossiersCibles,
  emplacementValide,
  fusionnerPropositionIa,
  lireOnglet,
  siteExistant,
} from "../../src/core/ajoutRapide.js";

const site = (id, url) => ({ id, type: "site", titre: id, url });
const dossier = (id, titre, items = []) => ({ id, type: "dossier", titre, items });
const grille = [
  site("s0", "https://exemple.fr"),
  dossier("d1", "Travail", [
    dossier("d2", "Clients", [dossier("d3", "Gros", [site("s1", "https://www.vu.fr/")])]),
  ]),
];

describe("lireOnglet", () => {
  it.each([
    "chrome://extensions",
    "chrome-extension://abc/newtab.html",
    "file:///c:/a.html",
    "about:blank",
    "javascript:alert(1)",
    "",
    undefined,
  ])("refuse %s", (url) => expect(lireOnglet({ url, titre: "x" }).ok).toBe(false));
  it("refuse le Web Store", () => {
    expect(lireOnglet({ url: "https://chromewebstore.google.com/detail/x" }).ok).toBe(false);
  });
  it("accepte http(s), normalise, coupe le titre à 60", () => {
    expect(lireOnglet({ url: "https://exemple.org/", titre: "x".repeat(100) })).toEqual({
      ok: true,
      url: "https://exemple.org",
      titre: "x".repeat(60),
    });
    expect(lireOnglet({ url: "http://a.fr/p?q=1", titre: " T " })).toMatchObject({
      ok: true,
      titre: "T",
    });
  });
});

describe("dossiersCibles", () => {
  it("liste à plat avec chemin et niveau, accueil en tête", () => {
    expect(dossiersCibles(grille).map((d) => [d.id, d.chemin, d.niveau])).toEqual([
      [null, "Accueil", 0],
      ["d1", "Travail", 1],
      ["d2", "Travail › Clients", 2],
      ["d3", "Travail › Clients › Gros", 3],
    ]);
  });
  it("ignore ce qui dépasse 3 niveaux", () => {
    const trop = [dossier("a", "A", [dossier("b", "B", [dossier("c", "C", [dossier("d", "D")])])])];
    expect(dossiersCibles(trop).map((d) => d.id)).toEqual([null, "a", "b", "c"]);
  });
});

describe("emplacementValide / siteExistant", () => {
  it("un dossier disparu retombe sur l'accueil", () => {
    expect(emplacementValide(grille, "d2")).toBe("d2");
    expect(emplacementValide(grille, "disparu")).toBeNull();
    expect(emplacementValide(grille, "s0")).toBeNull();
    expect(emplacementValide(grille, null)).toBeNull();
  });
  it("trouve un doublon en profondeur, sans tenir compte de www ni de la barre finale", () => {
    expect(siteExistant(grille, "https://vu.fr")).toMatchObject({
      chemin: "Travail › Clients › Gros",
    });
    expect(siteExistant(grille, "https://exemple.fr/")).toMatchObject({ chemin: "Accueil" });
    expect(siteExistant(grille, "https://autre.fr")).toBeNull();
  });
});

describe("fusionnerPropositionIa", () => {
  const base = { titre: "", tags: [], description: "", dossierId: null };
  const prop = { titre: "IA", tags: ["a"], description: "d", dossier: "d2" };
  it("remplit tout ce qui n'a pas été touché", () => {
    const r = fusionnerPropositionIa(base, prop, [], grille);
    expect(r.formulaire).toEqual({ titre: "IA", tags: ["a"], description: "d", dossierId: "d2" });
    expect(r.remplis).toEqual(["titre", "tags", "description", "dossier"]);
  });
  it("ne remplace jamais un champ modifié par l'utilisateur", () => {
    const r = fusionnerPropositionIa(
      { ...base, titre: "Mon nom" },
      prop,
      new Set(["titre", "dossier"]),
      grille,
    );
    expect(r.formulaire.titre).toBe("Mon nom");
    expect(r.formulaire.dossierId).toBeNull();
    expect(r.remplis).toEqual(["tags", "description"]);
  });
  it("dossier inconnu ou « accueil » → accueil", () => {
    expect(
      fusionnerPropositionIa(base, { dossier: "zz" }, [], grille).formulaire.dossierId,
    ).toBeNull();
    expect(
      fusionnerPropositionIa(base, { dossier: "accueil" }, [], grille).formulaire.dossierId,
    ).toBeNull();
  });
});

import { dimensionsFenetreAjout } from "../../src/core/ajoutRapide.js";

describe("fenêtre d'ajout (T4)", () => {
  it("75 % de l'écran, centrée", () => {
    expect(dimensionsFenetreAjout({ largeur: 1440, hauteur: 900 })).toEqual({
      width: 1080,
      height: 675,
      left: 180,
      top: 113,
    });
  });
  it("bornes minimale et maximale", () => {
    const g = dimensionsFenetreAjout({ largeur: 3840, hauteur: 2160 });
    expect([g.width, g.height]).toEqual([1100, 800]);
    const p = dimensionsFenetreAjout({ largeur: 800, hauteur: 600 });
    expect([p.width, p.height]).toEqual([640, 480]);
  });
  it("jamais plus grande que l'écran ; origine d'un second écran respectée", () => {
    const t = dimensionsFenetreAjout({ largeur: 500, hauteur: 400, gauche: 1920, haut: 0 });
    expect([t.width, t.height]).toEqual([500, 400]);
    expect(t.left).toBe(1920);
  });
  it("valeurs absentes : défauts raisonnables", () => {
    const d = dimensionsFenetreAjout(undefined);
    expect(d.width).toBeGreaterThanOrEqual(640);
  });
});
