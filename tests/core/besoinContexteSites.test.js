import { describe, expect, it } from "vitest";
import { besoinContexteSites } from "../../src/core/besoinContexteSites.js";

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
});
