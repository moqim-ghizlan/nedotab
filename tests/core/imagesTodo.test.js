import { describe, expect, it } from "vitest";
import {
  COTE_MAX,
  IMAGES_MAX,
  POIDS_MAX,
  QUOTA_MAX,
  cheminImage,
  cheminMini,
  cheminValide,
  cheminsDeFichiers,
  creerMetaImage,
  dimensionsCible,
  extensionPour,
  nettoyerNote,
  nouvelIdImage,
  octetsDesImages,
  ordreSuivant,
  validerImage,
  validerResultat,
} from "../../src/core/imagesTodo.js";

const fichier = (name, type, size = 1000) => ({ name, type, size });

describe("validerImage", () => {
  it("accepte JPEG, PNG, WebP", () => {
    expect(validerImage(fichier("a.jpg", "image/jpeg")).ok).toBe(true);
    expect(validerImage(fichier("a.PNG", "image/png")).ok).toBe(true);
    expect(validerImage(fichier("a.webp", "image/webp")).ok).toBe(true);
    expect(validerImage(fichier("capture", "image/png")).ok).toBe(true); // collé : pas de nom
  });
  it("refuse SVG, GIF, HEIC, HTML et un exécutable renommé", () => {
    expect(validerImage(fichier("a.svg", "image/svg+xml")).code).toBe("svg");
    expect(validerImage(fichier("a.gif", "image/gif")).code).toBe("gif");
    expect(validerImage(fichier("a.heic", "image/heic")).code).toBe("heic");
    expect(validerImage(fichier("a.jpg", "text/html")).code).toBe("type");
    expect(validerImage(fichier("a.exe", "application/x-msdownload")).code).toBe("type");
    // Le type JPEG déclaré ne sauve pas une extension .exe.
    expect(validerImage(fichier("virus.exe", "image/jpeg")).ok).toBe(false);
    expect(validerImage(fichier("a.jpg", "")).ok).toBe(false);
  });
  it("limite de nombre, fichier vide, énorme, quota", () => {
    expect(validerImage(fichier("a.jpg", "image/jpeg"), { nbImages: IMAGES_MAX }).code).toBe("limite");
    expect(validerImage(fichier("a.jpg", "image/jpeg"), { nbImages: IMAGES_MAX - 1 }).ok).toBe(true);
    expect(validerImage(fichier("a.jpg", "image/jpeg", 0)).code).toBe("vide");
    expect(validerImage(fichier("a.jpg", "image/jpeg", 60 * 1024 * 1024)).code).toBe("trop-gros");
    expect(validerImage(fichier("a.jpg", "image/jpeg"), { octetsUtilises: QUOTA_MAX }).code).toBe("quota");
  });
  it("le poids après réduction : 5 Mo au plus, quota de 200 Mo", () => {
    expect(validerResultat(POIDS_MAX).ok).toBe(true);
    expect(validerResultat(POIDS_MAX + 1).code).toBe("poids");
    expect(validerResultat(1000, QUOTA_MAX - 999).code).toBe("quota");
    expect(validerResultat(1000, QUOTA_MAX - 1000).ok).toBe(true);
  });
});

describe("dimensionsCible", () => {
  it("paysage, portrait, déjà petite, carrée", () => {
    expect(dimensionsCible(4000, 3000)).toEqual({ largeur: COTE_MAX, hauteur: 1440, reduite: true });
    expect(dimensionsCible(3000, 4000)).toEqual({ largeur: 1440, hauteur: COTE_MAX, reduite: true });
    expect(dimensionsCible(800, 600)).toEqual({ largeur: 800, hauteur: 600, reduite: false });
    expect(dimensionsCible(5000, 5000)).toEqual({ largeur: COTE_MAX, hauteur: COTE_MAX, reduite: true });
    expect(dimensionsCible(COTE_MAX, 10).reduite).toBe(false);
  });
  it("ne descend jamais sous 1 pixel", () => {
    expect(dimensionsCible(100_000, 1)).toMatchObject({ largeur: COTE_MAX, hauteur: 1 });
  });
  it("vignette de 240 px", () => {
    expect(dimensionsCible(1920, 1080, 240)).toEqual({ largeur: 240, hauteur: 135, reduite: true });
  });
});

describe("noms et chemins", () => {
  it("l'identifiant fait 32 caractères hexadécimaux, jamais le nom d'origine", () => {
    const id = nouvelIdImage();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(nouvelIdImage((n) => new Uint8Array(n).fill(255))).toBe("f".repeat(32));
  });
  it("chemin, miniature et validation", () => {
    const id = "a".repeat(32);
    const c = cheminImage("u1", "t1", id, "webp");
    expect(c).toBe(`todos/u1/t1/${id}.webp`);
    expect(cheminMini(c)).toBe(`todos/u1/t1/${id}_mini.webp`);
    expect(cheminValide("u1", c)).toBe(true);
    expect(cheminValide("u2", c)).toBe(false);
    expect(cheminValide("u1", "todos/u1/t1/../x.webp")).toBe(false);
    expect(cheminValide("u1", "https://exemple.fr/a.webp")).toBe(false);
    expect(extensionPour("image/jpeg")).toBe("jpg");
    expect(extensionPour("image/png")).toBe("png");
    expect(extensionPour("autre")).toBe("webp");
  });
  it("fichiers à supprimer : l'image et sa miniature", () => {
    const l = [{ chemin: "todos/u/t/a.webp" }, { chemin: 3 }];
    expect(cheminsDeFichiers(l)).toEqual(["todos/u/t/a.webp", "todos/u/t/a_mini.webp"]);
  });
});

describe("notes et métadonnées", () => {
  it("la note est du texte brut de 300 caractères, sans contrôle ni direction", () => {
    expect(nettoyerNote("  a\u202Eb\u0000c  ")).toBe("a b c");
    expect(nettoyerNote("x".repeat(400))).toHaveLength(300);
    expect(nettoyerNote(null)).toBe("");
  });
  it("métadonnées, ordre suivant et octets", () => {
    const m = creerMetaImage({ id: "i", chemin: "c", taille: 5, typeMime: "image/webp", largeur: 1, hauteur: 2, note: "n" });
    expect(m).toEqual({ id: "i", chemin: "c", note: "n", taille: 5, typeMime: "image/webp", largeur: 1, hauteur: 2, ordre: 1000 });
    expect(ordreSuivant([])).toBe(1000);
    expect(ordreSuivant([{ ordre: 4000 }, { ordre: 2000 }])).toBe(5000);
    expect(octetsDesImages([{ taille: 5 }, { taille: 7 }, {}])).toBe(12);
    expect(octetsDesImages(undefined)).toBe(0);
  });
});
