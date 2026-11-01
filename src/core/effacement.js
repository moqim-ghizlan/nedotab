/**
 * Erasing what the AI wrote in the grid (V4.20). Pure.
 */
import { normaliserEtatIa } from "./tags.js";

/**
 * The same grid without the tags and descriptions the AI generated: a site whose tags the user
 * wrote (tagsManuels) is left untouched. Folders keep their content.
 * @returns {{ grille: object[], efface: number }} `efface`: how many sites were emptied
 */
export function effacerTagsGeneres(grille) {
  let efface = 0;
  const parcourir = (liste) =>
    liste.map((e) => {
      if (e?.type === "dossier") return { ...e, items: parcourir(e.items ?? []) };
      if (e?.type !== "site" || e.tagsManuels === true) return e;
      const aDuContenu = (e.tags?.length ?? 0) > 0 || !!e.description || e.ia?.etat === "ok";
      if (!aDuContenu) return e;
      efface++;
      return { ...e, tags: [], description: "", ia: normaliserEtatIa(null) };
    });
  const resultat = parcourir(Array.isArray(grille) ? grille : []);
  return { grille: efface ? resultat : grille, efface };
}
