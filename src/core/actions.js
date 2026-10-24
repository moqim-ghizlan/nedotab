/**
 * Actions are plain JSON objects ({ type, ...data }). The reducer is the only way to change
 * the state: it never mutates its input and returns a new object along the modified path.
 */
export const A = {
  CHARGER: "CHARGER",
  SITE_AJOUTER: "SITE_AJOUTER",
};

export function reduire(etat, action) {
  switch (action.type) {
    case A.CHARGER:
      return action.etat;
    case A.SITE_AJOUTER: {
      const grille = [...etat.grille];
      const index = action.index ?? grille.length;
      grille.splice(Math.max(0, Math.min(index, grille.length)), 0, action.site);
      return { ...etat, grille };
    }
    default:
      return etat;
  }
}
