/**
 * Actions are plain JSON objects ({ type, ...data }). The reducer is the only way to change
 * the state: it never mutates its input and returns a new object along the modified path.
 */
export const A = {
  CHARGER: "CHARGER",
  SITE_AJOUTER: "SITE_AJOUTER",
  SITE_MODIFIER: "SITE_MODIFIER",
};

/** Fields of a site that SITE_MODIFIER may change. */
const CHAMPS_SITE = ["titre", "url", "icone"];

function filtrerChamps(changements, autorises) {
  return Object.fromEntries(
    Object.entries(changements ?? {}).filter(([cle]) => autorises.includes(cle)),
  );
}

export function reduire(etat, action) {
  switch (action.type) {
    case A.CHARGER:
      return action.etat;
    case A.SITE_AJOUTER: {
      // Idempotent: replaying an action already applied elsewhere changes nothing.
      if (etat.grille.some((e) => e.id === action.site.id)) return etat;
      const grille = [...etat.grille];
      const index = action.index ?? grille.length;
      grille.splice(Math.max(0, Math.min(index, grille.length)), 0, action.site);
      return { ...etat, grille };
    }
    case A.SITE_MODIFIER: {
      const i = etat.grille.findIndex((e) => e.id === action.id && e.type === "site");
      const changements = filtrerChamps(action.changements, CHAMPS_SITE);
      if (i < 0 || Object.keys(changements).length === 0) return etat;
      const grille = [...etat.grille];
      grille[i] = { ...grille[i], ...changements };
      return { ...etat, grille };
    }
    default:
      return etat;
  }
}
