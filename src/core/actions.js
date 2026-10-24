/**
 * Actions are plain JSON objects ({ type, ...data }). The reducer is the only way to change
 * the state: it never mutates its input and returns a new object along the modified path.
 */
import { deplacer, inserer, remplacer, retirer, trouver } from "./arbre.js";

export const A = {
  CHARGER: "CHARGER",
  SITE_AJOUTER: "SITE_AJOUTER",
  SITE_MODIFIER: "SITE_MODIFIER",
  ELEMENT_SUPPRIMER: "ELEMENT_SUPPRIMER",
  ELEMENT_RESTAURER: "ELEMENT_RESTAURER",
  ELEMENT_DEPLACER: "ELEMENT_DEPLACER",
};

/** Fields of a site that SITE_MODIFIER may change. */
const CHAMPS_SITE = ["titre", "url", "icone"];

function filtrerChamps(changements, autorises) {
  return Object.fromEntries(
    Object.entries(changements ?? {}).filter(([cle]) => autorises.includes(cle)),
  );
}

const avecGrille = (etat, grille) => (grille === etat.grille ? etat : { ...etat, grille });

export function reduire(etat, action) {
  switch (action.type) {
    case A.CHARGER:
      return action.etat;
    case A.SITE_AJOUTER: {
      // Idempotent: replaying an action already applied elsewhere changes nothing.
      if (trouver(etat.grille, action.site.id)) return etat;
      return avecGrille(
        etat,
        inserer(etat.grille, action.site, action.parentId ?? null, action.index),
      );
    }
    case A.SITE_MODIFIER: {
      const changements = filtrerChamps(action.changements, CHAMPS_SITE);
      if (Object.keys(changements).length === 0) return etat;
      return avecGrille(
        etat,
        remplacer(etat.grille, action.id, (e) =>
          e.type === "site" ? { ...e, ...changements } : e,
        ),
      );
    }
    case A.ELEMENT_SUPPRIMER: {
      const r = retirer(etat.grille, action.id);
      return r ? avecGrille(etat, r.grille) : etat;
    }
    case A.ELEMENT_RESTAURER: {
      if (trouver(etat.grille, action.element.id)) return etat;
      // The original folder may have disappeared meanwhile: fall back to the root.
      const parentId =
        action.parentId != null && trouver(etat.grille, action.parentId) ? action.parentId : null;
      return avecGrille(etat, inserer(etat.grille, action.element, parentId, action.index));
    }
    case A.ELEMENT_DEPLACER:
      return avecGrille(
        etat,
        deplacer(etat.grille, action.id, action.versParentId ?? null, action.versIndex),
      );
    default:
      return etat;
  }
}
