import { describe, expect, it } from "vitest";
import { besoinContexteSites, demandeActions } from "../../src/core/besoinContexteSites.js";

const sites = [
  { titre: "Marmiton", url: "https://www.marmiton.org", tags: ["cuisine", "recettes"] },
  { titre: "GitHub", url: "https://github.com", tags: ["dev", "code"] },
];
const q = (texte, extra = {}) => ({
  sites,
  messages: [{ role: "user", texte }],
  ...extra,
});

describe("besoinContexteSites (V4.14)", () => {
  it.each([
    "Quels sites j'ai pour cuisiner ?",
    "Range mes sites de dev par thème",
    "Est-ce que j'ai un outil pour les PDF ?",
    "Dans mon dossier Travail, qu'est-ce qu'il y a ?",
    "Ma collection a des doublons ?",
    "Organise mes favoris",
    "Une idée de recette ? (cuisine)",
    "Je veux un site de code comme GitHub",
  ])("auto : oui pour « %s »", (texte) => {
    expect(besoinContexteSites(q(texte))).toBe(true);
  });

  it.each([
    "Explique-moi la photosynthèse",
    "Traduis bonjour en anglais",
    "Combien font 12 fois 7 ?",
    "Écris un poème sur la mer",
    "Bonjour",
  ])("auto : non pour « %s »", (texte) => {
    expect(besoinContexteSites(q(texte))).toBe(false);
  });

  it("auto : une suite courte après une réponse qui citait des sites", () => {
    const messages = [
      { role: "user", texte: "Quels sites pour cuisiner ?" },
      { role: "assistant", texte: "Voici : [[site:abc]]" },
      { role: "user", texte: "Et pour la pâtisserie ?" },
    ];
    expect(besoinContexteSites({ sites, messages })).toBe(true);
  });

  it("toujours / jamais / grille vide / mode inconnu", () => {
    expect(besoinContexteSites(q("Bonjour", { mode: "toujours" }))).toBe(true);
    expect(besoinContexteSites(q("Mes sites ?", { mode: "jamais" }))).toBe(false);
    expect(besoinContexteSites(q("Mes sites ?", { sites: [] }))).toBe(false);
    expect(besoinContexteSites(q("Mes sites ?", { mode: "autre" }))).toBe(true);
  });

  it("demande de modification (V4.16) : le contexte est joint, même avec une grille vide", () => {
    expect(besoinContexteSites(q("Crée un dossier Voyage"))).toBe(true);
    expect(besoinContexteSites(q("Ajoute github.com", { sites: [] }))).toBe(true);
    expect(besoinContexteSites(q("Ajoute github.com", { sites: [], mode: "jamais" }))).toBe(false);
    expect(besoinContexteSites(q("Bonjour", { sites: [] }))).toBe(false);
  });

  it.each([
    "ajoute github.com dans Travail",
    "Crée un dossier Voyage",
    "renomme le dossier Dev",
    "déplace Marmiton",
    "supprime les doublons",
    "range mes sites",
  ])("demandeActions : oui pour « %s »", (t) => expect(demandeActions(t)).toBe(true));

  it.each(["Explique le DNS", "Quel est mon site préféré ?", "Merci beaucoup"])(
    "demandeActions : non pour « %s »",
    (t) => expect(demandeActions(t)).toBe(false),
  );
});
