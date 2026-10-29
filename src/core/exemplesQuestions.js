/**
 * Example questions shown in the question mode while the field is empty (V4.8). Made locally
 * from the most used tags of the user, never sent anywhere.
 */
import { tagsUtilises } from "./tags.js";

export const EXEMPLES_MAX = 3;

const MODELES = [
  (t) => `Où est mon outil de ${t} ?`,
  (t) => `Montre-moi mes sites de ${t}`,
  (t) => `Quel site ai-je enregistré pour ${t} ?`,
];

export const EXEMPLES_GENERIQUES = [
  "L'outil pour retoucher des photos",
  "Le site de recettes que j'ai ajouté le mois dernier",
  "Mes sites pour apprendre à programmer",
];

/** At most 3 questions: one per frequent tag, completed by generic ones. */
export function exemplesQuestions(grille) {
  const tags = tagsUtilises(grille).slice(0, EXEMPLES_MAX);
  const exemples = tags.map((tag, i) => MODELES[i % MODELES.length](tag));
  for (const g of EXEMPLES_GENERIQUES) {
    if (exemples.length >= EXEMPLES_MAX) break;
    exemples.push(g);
  }
  return exemples;
}
