import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { PHOTOS_GALERIE } from "../../src/core/catalogueGalerie.js";
import {
  CATEGORIES_GALERIE,
  COTE_MAX_PX,
  estIdPhoto,
  photoAuHasard,
  photoDuFond,
  photoDuJour,
  photosDe,
  tailleEcran,
  trouverPhoto,
  urlPagePhoto,
  urlPhoto,
} from "../../src/core/galerie.js";
import { etatInitial } from "../../src/core/modele.js";
import { validerFond } from "../../src/core/reglages.js";

describe("catalogue de la galerie", () => {
  it("10 catégories, chacune avec des photos", () => {
    expect(CATEGORIES_GALERIE.map((c) => c.libelle)).toEqual([
      "Nature",
      "Tech",
      "Romance",
      "Villes",
      "Espace",
      "Mer",
      "Montagne",
      "Minimaliste",
      "Animaux",
      "Art abstrait",
    ]);
    for (const { id } of CATEGORIES_GALERIE)
      expect(PHOTOS_GALERIE[id].length).toBeGreaterThanOrEqual(12);
  });
  it("identifiants valides, uniques dans chaque catégorie, auteur et page renseignés", () => {
    for (const liste of Object.values(PHOTOS_GALERIE)) {
      const ids = liste.map((p) => p[0]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [id, page, auteur, pseudo] of liste) {
        expect(estIdPhoto(id)).toBe(true);
        expect(page).toMatch(/^[\w-]+$/);
        expect(auteur.length).toBeGreaterThan(0);
        expect(pseudo).toMatch(/^[\w.-]+$/);
      }
    }
  });
  it("« Toutes » : chaque photo une seule fois", () => {
    const ids = photosDe("toutes").map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(trouverPhoto(ids[0]).auteur).toBeTruthy();
    expect(urlPagePhoto(trouverPhoto(ids[0]))).toMatch(/^https:\/\/unsplash\.com\/photos\//);
  });
});

describe("taille demandée", () => {
  it("l'écran × la densité, arrondi vers le haut", () => {
    expect(tailleEcran({ largeur: 1920, hauteur: 1080, densite: 1 })).toEqual({
      largeur: 1920,
      hauteur: 1080,
    });
    expect(tailleEcran({ largeur: 390, hauteur: 844, densite: 3 })).toEqual({
      largeur: 1280,
      hauteur: 2770,
    });
  });
  it("jamais plus de 3840 px de côté, proportions gardées", () => {
    const t = tailleEcran({ largeur: 2560, hauteur: 1440, densite: 2 });
    expect(Math.max(t.largeur, t.hauteur)).toBeLessThanOrEqual(COTE_MAX_PX);
    expect(t.largeur / t.hauteur).toBeCloseTo(16 / 9, 2);
  });
  it("URL recadrée à cette taille", () => {
    expect(urlPhoto("photo-1470071459604-3b5ec3a7fe05", { largeur: 1920, hauteur: 1080 })).toBe(
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&h=1080&fit=crop&crop=entropy&auto=format&q=80",
    );
  });
});

describe("tirage", () => {
  it("photo du jour : la même toute la journée, dans la catégorie", () => {
    const matin = new Date(2026, 9, 25, 8);
    const soir = new Date(2026, 9, 25, 22);
    expect(photoDuJour("mer", matin)).toBe(photoDuJour("mer", soir));
    expect(photosDe("mer").map((p) => p.id)).toContain(photoDuJour("mer", matin));
    const semaine = new Set(
      [1, 2, 3, 4, 5, 6, 7].map((j) => photoDuJour("toutes", new Date(2026, 9, j))),
    );
    expect(semaine.size).toBeGreaterThan(3);
  });
  it("au hasard : jamais la photo actuelle", () => {
    const actuelle = photosDe("espace")[0].id;
    for (let i = 0; i < 50; i++)
      expect(photoAuHasard("espace", Math.random, actuelle)).not.toBe(actuelle);
  });
  it("photo affichée selon le fond", () => {
    const date = new Date(2026, 9, 25);
    expect(photoDuFond({ type: "galerie", id: "photo-1-abcdef" })).toBe("photo-1-abcdef");
    expect(photoDuFond({ type: "aleatoire", categorie: "mer", frequence: "jour" }, { date })).toBe(
      photoDuJour("mer", date),
    );
    expect(
      photoDuFond({
        type: "aleatoire",
        categorie: "mer",
        frequence: "clic",
        choix: "photo-9-abcdef",
      }),
    ).toBe("photo-9-abcdef");
    expect(
      photoDuFond(
        { type: "aleatoire", categorie: "mer", frequence: "onglet" },
        { onglet: "photo-7-abcdef" },
      ),
    ).toBe("photo-7-abcdef");
    expect(photoDuFond({ type: "couleur", valeur: "#000000" })).toBeNull();
  });
});

describe("fond galerie et aléatoire", () => {
  it("validés", () => {
    expect(validerFond({ type: "galerie", id: "photo-1470071459604-3b5ec3a7fe05" })).toEqual({
      type: "galerie",
      id: "photo-1470071459604-3b5ec3a7fe05",
      voile: 0.25,
      flou: 0,
    });
    expect(validerFond({ type: "galerie", id: "javascript:alert(1)" })).toBeNull();
    expect(
      validerFond({ type: "aleatoire", categorie: "nature", frequence: "jour", choix: "x" }),
    ).toEqual({ type: "aleatoire", categorie: "nature", frequence: "jour", voile: 0.25, flou: 0 });
    expect(validerFond({ type: "aleatoire", categorie: "cuisine", frequence: "jour" })).toBeNull();
    expect(validerFond({ type: "aleatoire", categorie: "toutes", frequence: "heure" })).toBeNull();
  });
  it("synchronisé (réglages communs) et remplace l'image propre à l'appareil", () => {
    let etat = reduire(etatInitial(), {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "image", ref: "local:abc", dominante: "#123456" } },
    });
    expect(etat.reglagesAppareil.fond).toBeDefined();
    etat = reduire(etat, {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "aleatoire", categorie: "espace", frequence: "onglet" } },
    });
    expect(etat.reglages.fond.type).toBe("aleatoire");
    expect(etat.reglagesAppareil.fond).toBeUndefined();
  });
});
