import { fermerFeuilleActions, ouvrirFeuilleActions } from "./feuilleActions.js";
import { fermerMenu, ouvrirMenu } from "./menuContextuel.js";

/** Phone width: below it the actions are a sheet at the bottom, above it a menu by the tile. */
export const LARGEUR_TELEPHONE = 600;

/** True on a screen without hover (finger): the touch presentation is used. */
export function ecranTactile() {
  return !!globalThis.matchMedia?.("(hover: none)").matches;
}

export function fermerMenuTactile() {
  fermerFeuilleActions();
  fermerMenu();
}

/**
 * Touch presentation of the actions of a tile (V3.6), opened by a long press. The entries
 * come from the same catalogue as the mouse menu (actionsElement.js): iPhone → action sheet;
 * iPad → floating menu anchored to the tile, below it or above it when there is no room.
 */
export function ouvrirMenuTactile({ entrees, libelle, tuile }) {
  const retourFocus = tuile;
  if (innerWidth < LARGEUR_TELEPHONE) {
    return ouvrirFeuilleActions({ entrees, libelle, tuile, retourFocus });
  }
  const r = tuile.getBoundingClientRect();
  return ouvrirMenu({ x: r.left, y: r.bottom + 6, entrees, retourFocus, libelle });
}
