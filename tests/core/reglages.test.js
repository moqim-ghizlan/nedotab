import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import {
  contraste,
  estClaire,
  luminance,
  moyenne,
  TEXTE_SUR_CLAIR,
  TEXTE_SUR_SOMBRE,
} from "../../src/core/couleurs.js";
import { migrer } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";
import { affichageAccueilDe, fondEffectif, validerFond } from "../../src/core/reglages.js";
import { DEGRADES } from "../../src/ui/fonds.js";

describe("luminance et choix du texte", () => {
  it("blanc, noir, gris moyen", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#777777")).toBeCloseTo(0.184, 2);
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21);
  });
  it("couleurs vives", () => {
    expect(estClaire("#ffff00")).toBe(true); // yellow: dark text
    expect(estClaire("#0000ff")).toBe(false); // blue: white text
    expect(estClaire("#c00000")).toBe(false);
    expect(estClaire("#00ff00")).toBe(true);
    expect(estClaire("#ffffff")).toBe(true);
    expect(estClaire("#000000")).toBe(false);
  });
});

describe("contraste des 8 dégradés", () => {
  // The average colour of the stops stands for the gradient; the text colour is the one
  // chosen by estClaire(). WCAG AA for normal text requires 4.5:1.
  for (const [nom, { couleurs }] of Object.entries(DEGRADES)) {
    it(`${nom} ≥ 4,5:1`, () => {
      const fond = moyenne(couleurs);
      const texte = estClaire(fond) ? TEXTE_SUR_CLAIR : TEXTE_SUR_SOMBRE;
      expect(contraste(fond, texte)).toBeGreaterThanOrEqual(4.5);
      // and on each stop too, so that no part of the gradient becomes unreadable
      for (const c of couleurs) expect(contraste(c, texte)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("REGLAGES_MODIFIER", () => {
  const etat = etatInitial();
  const modifier = (changements) => reduire(etat, { type: A.REGLAGES_MODIFIER, changements });
  it("thème", () => {
    expect(modifier({ theme: "sombre" }).reglages.theme).toBe("sombre");
    expect(modifier({ theme: "rose" })).toBe(etat);
  });
  it("ouvrir les sites dans un nouvel onglet : synchronisé, gardé seulement s'il est activé", () => {
    const active = modifier({ nouvelOnglet: true });
    expect(active.reglages.nouvelOnglet).toBe(true);
    expect(active.reglagesAppareil).toEqual({});
    const desactive = reduire(active, {
      type: A.REGLAGES_MODIFIER,
      changements: { nouvelOnglet: false },
    });
    expect("nouvelOnglet" in desactive.reglages).toBe(false);
    expect(modifier({ nouvelOnglet: false })).toBe(etat);
    expect(modifier({ nouvelOnglet: "oui" })).toBe(etat);
  });
  it("recherches web dans un nouvel onglet : même règle, indépendant des sites", () => {
    const active = modifier({ rechercheNouvelOnglet: true });
    expect(active.reglages.rechercheNouvelOnglet).toBe(true);
    expect("nouvelOnglet" in active.reglages).toBe(false);
    const desactive = reduire(active, {
      type: A.REGLAGES_MODIFIER,
      changements: { rechercheNouvelOnglet: false },
    });
    expect("rechercheNouvelOnglet" in desactive.reglages).toBe(false);
    expect(modifier({ rechercheNouvelOnglet: false })).toBe(etat);
    expect(modifier({ rechercheNouvelOnglet: 1 })).toBe(etat);
  });
  it("refuse une clé inconnue", () => {
    expect(modifier({ police: "Comic" })).toBe(etat);
    expect(modifier({ theme: "clair", police: "Comic" })).toBe(etat);
  });
  it("refuse une couleur invalide", () => {
    expect(modifier({ fond: { type: "couleur", valeur: "rouge" } })).toBe(etat);
    expect(modifier({ fond: { type: "couleur", valeur: "#12345" } })).toBe(etat);
    expect(modifier({ fond: { type: "couleur", valeur: "#AbCdEf" } }).reglages.fond.valeur).toBe(
      "#abcdef",
    );
  });
  it("borne voile et flou", () => {
    const fond = modifier({
      fond: { type: "image", ref: "local:x", dominante: "#123456", voile: 3, flou: 99 },
    }).reglagesAppareil.fond;
    expect(fond).toMatchObject({ voile: 0.7, flou: 20 });
    expect(validerFond({ type: "image", ref: "local:x", voile: -1, flou: -5 })).toMatchObject({
      voile: 0,
      flou: 0,
    });
  });
  it("refuse une image qui n'est pas locale et un dégradé inconnu", () => {
    expect(modifier({ fond: { type: "image", ref: "https://x/y.jpg" } })).toBe(etat);
    expect(modifier({ fond: { type: "degrade", valeur: "arc-en-ciel" } })).toBe(etat);
  });
});

describe("migration des réglages", () => {
  it("un état sans reglages.fond reçoit { type: 'aucun' }", () => {
    expect(
      migrer({ versionSchema: 1, grille: [], reglages: { theme: "sombre" } }).etat.reglages,
    ).toEqual({
      theme: "sombre",
      fond: { type: "aucun" },
      fonds: [],
    });
  });
  it("valeurs invalides remplacées par les valeurs par défaut", () => {
    expect(
      migrer({ versionSchema: 1, grille: [], reglages: { theme: 3, fond: { type: "?" } } }).etat
        .reglages,
    ).toEqual({
      theme: "auto",
      fond: { type: "aucun" },
      fonds: [],
    });
  });
});

describe("chargement de nouvelOnglet", () => {
  it("vrai gardé, toute autre valeur retirée", () => {
    const charger = (nouvelOnglet) =>
      migrer({ ...etatInitial(), reglages: { ...etatInitial().reglages, nouvelOnglet } }).etat
        .reglages;
    expect(charger(true).nouvelOnglet).toBe(true);
    expect("nouvelOnglet" in charger(false)).toBe(false);
    expect("nouvelOnglet" in charger("oui")).toBe(false);
    const recherche = migrer({
      ...etatInitial(),
      reglages: { ...etatInitial().reglages, rechercheNouvelOnglet: true },
    }).etat.reglages;
    expect(recherche.rechercheNouvelOnglet).toBe(true);
  });
});

describe("schéma 2 : réglages de l'appareil", () => {
  it("migration 1 → 2 : un fond image local passe dans reglagesAppareil", () => {
    const fond = { type: "image", ref: "local:x", dominante: "#123456", voile: 0.2, flou: 0 };
    const { etat } = migrer({ versionSchema: 1, grille: [], reglages: { theme: "sombre", fond } });
    expect(etat.versionSchema).toBe(2);
    expect(etat.reglages).toEqual({ theme: "sombre", fond: { type: "aucun" }, fonds: [] });
    expect(etat.reglagesAppareil.fond).toMatchObject({ ref: "local:x" });
  });
  it("migration 1 → 2 sans image : reglagesAppareil vide", () => {
    const { etat } = migrer({
      versionSchema: 1,
      grille: [],
      reglages: { theme: "auto", fond: { type: "degrade", valeur: "nuit" } },
    });
    expect(etat.reglages.fond).toEqual({ type: "degrade", valeur: "nuit" });
    expect(etat.reglagesAppareil).toEqual({});
  });
  it("choisir une image : appareil seulement ; choisir un dégradé : synchronisé et l'image locale est retirée", () => {
    let etat = etatInitial();
    etat = reduire(etat, {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "image", ref: "local:y", dominante: "#000000" } },
    });
    expect(etat.reglages.fond).toEqual({ type: "aucun" });
    expect(fondEffectif(etat).type).toBe("image");
    etat = reduire(etat, {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "degrade", valeur: "lagon" } },
    });
    expect(etat.reglagesAppareil).toEqual({});
    expect(fondEffectif(etat)).toEqual({ type: "degrade", valeur: "lagon" });
  });
  it("reglagesAppareil invalide au chargement : ignoré", () => {
    const { etat } = migrer({
      versionSchema: 2,
      grille: [],
      reglages: {},
      reglagesAppareil: { fond: { type: "couleur", valeur: "#000000" } },
    });
    expect(etat.reglagesAppareil).toEqual({});
  });
});

describe("réglages propres à l'appareil (V2.9)", () => {
  const modifier = (etat, changements) => reduire(etat, { type: A.REGLAGES_MODIFIER, changements });
  it("colonnes forcées : 3 à 10, null pour automatique, jamais dans les réglages synchronisés", () => {
    let etat = modifier(etatInitial(), { colonnes: 6 });
    expect(etat.reglagesAppareil).toEqual({ colonnes: 6 });
    expect(etat.reglages).not.toHaveProperty("colonnes");
    expect(modifier(etat, { colonnes: 11 })).toBe(etat);
    expect(modifier(etat, { colonnes: 2.5 })).toBe(etat);
    etat = modifier(etat, { colonnes: null });
    expect(etat.reglagesAppareil).toEqual({});
  });
  it("journal de débogage : local, et jamais mêlé à un réglage synchronisé", () => {
    const etat = modifier(etatInitial(), { debug: true });
    expect(etat.reglagesAppareil).toEqual({ debug: true });
    expect(modifier(etat, { debug: true })).toBe(etat);
    expect(modifier(etat, { debug: true, theme: "sombre" })).toBe(etat);
    expect(modifier(etat, { debug: false }).reglagesAppareil).toEqual({});
  });
  it("curseur à l'ouverture : laisser la barre de Chrome est local et gardé seulement s'il est choisi", () => {
    const etat = modifier(etatInitial(), { barreChrome: true });
    expect(etat.reglagesAppareil).toEqual({ barreChrome: true });
    expect("barreChrome" in etat.reglages).toBe(false);
    expect(modifier(etat, { barreChrome: true, theme: "sombre" })).toBe(etat);
    expect(modifier(etat, { barreChrome: false }).reglagesAppareil).toEqual({});
    const charge = migrer({
      ...etatInitial(),
      reglagesAppareil: { barreChrome: true },
    }).etat.reglagesAppareil;
    expect(charge).toEqual({ barreChrome: true });
  });
  it("affichage de l'accueil : choix gardé sur cet appareil seulement (V3.4 : pages aussi)", () => {
    let etat = modifier(etatInitial(), { affichageAccueil: "defilement" });
    expect(etat.reglagesAppareil).toEqual({ affichageAccueil: "defilement" });
    expect("affichageAccueil" in etat.reglages).toBe(false);
    expect(modifier(etat, { affichageAccueil: "colonnes" })).toBe(etat);
    etat = modifier(etat, { affichageAccueil: "pages" });
    expect(etat.reglagesAppareil).toEqual({ affichageAccueil: "pages" });
    etat = modifier(etat, { affichageAccueil: null }); // back to automatic
    expect(etat.reglagesAppareil).toEqual({});
    const charge = (affichageAccueil) =>
      migrer({ ...etatInitial(), reglagesAppareil: { affichageAccueil } }).etat.reglagesAppareil;
    expect(charge("defilement")).toEqual({ affichageAccueil: "defilement" });
    expect(charge("pages")).toEqual({ affichageAccueil: "pages" });
    expect(charge(3)).toEqual({});
  });
  it("affichage par défaut : défilement sur téléphone, pages ailleurs, choix respecté", () => {
    const cas = [
      [{}, 375, "defilement"], // iPhone, portrait or landscape: shorter side
      [{}, 320, "defilement"], // iPhone SE
      [{}, 744, "pages"], // iPad mini
      [{}, 1080, "pages"], // computer
      [undefined, 375, "defilement"],
      [{ affichageAccueil: "pages" }, 375, "pages"],
      [{ affichageAccueil: "defilement" }, 1080, "defilement"],
      [{ affichageAccueil: "autre" }, 1080, "pages"],
    ];
    for (const [appareil, cote, attendu] of cas)
      expect(affichageAccueilDe(appareil, cote)).toBe(attendu);
  });
  it("chargement : colonnes et debug validés", () => {
    const { etat } = migrer({
      versionSchema: 2,
      grille: [],
      reglages: {},
      reglagesAppareil: { colonnes: 7, debug: true, autre: 1 },
    });
    expect(etat.reglagesAppareil).toEqual({ colonnes: 7, debug: true });
    expect(
      migrer({
        versionSchema: 2,
        grille: [],
        reglages: {},
        reglagesAppareil: { colonnes: 99, debug: "oui" },
      }).etat.reglagesAppareil,
    ).toEqual({});
  });
});
