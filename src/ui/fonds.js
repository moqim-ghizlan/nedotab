import { NOMS_DEGRADES } from "../core/reglages.js";

/**
 * Built-in gradients (no network image). `couleurs` are the stops: their average decides
 * whether the text on top is dark or light.
 */
export const DEGRADES = {
  aurore: { libelle: "Aurore", couleurs: ["#f6d5c3", "#e8d3dc", "#c9d8e8"] },
  lagon: { libelle: "Lagon", couleurs: ["#0c4e56", "#166560", "#227a70"] },
  foret: { libelle: "Forêt", couleurs: ["#1e3b2c", "#2d523b", "#3e6b4b"] },
  crepuscule: { libelle: "Crépuscule", couleurs: ["#2b2d55", "#5a3e60", "#8a4f6b"] },
  brume: { libelle: "Brume", couleurs: ["#e6ebe7", "#d3dcd8", "#b9c7c3"] },
  ardoise: { libelle: "Ardoise", couleurs: ["#2c3440", "#3a4555", "#49566a"] },
  sable: { libelle: "Sable", couleurs: ["#f2e7d0", "#e5d4b2", "#d6c09a"] },
  nuit: { libelle: "Nuit", couleurs: ["#0e1424", "#161f34", "#1f2a44"] },
};

if (NOMS_DEGRADES.some((n) => !DEGRADES[n])) throw new Error("Dégradé manquant");

export const cssDegrade = (nom) => `linear-gradient(135deg, ${DEGRADES[nom].couleurs.join(", ")})`;

/** Ten quick colours for a plain background. */
export const COULEURS_FOND = [
  "#e4e8e1",
  "#f3efe6",
  "#dfe7ef",
  "#f2dfd7",
  "#1e293b",
  "#161d19",
  "#2c6b5a",
  "#3a5ba0",
  "#7d3f98",
  "#a2501c",
];
