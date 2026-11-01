/**
 * Pure rules of the mobile chat (V4.18): no DOM.
 */

/**
 * Size and place of the full-screen sheet while the iOS keyboard is open. iOS shrinks the
 * VISUAL viewport (visualViewport.height) without shrinking the layout one, and may scroll it
 * (offsetTop): the sheet follows the visible area so the input stays above the keyboard.
 * @param {{ hauteurVisible: number, decalageHaut: number, hauteurFenetre: number }} v
 * @returns {{ hauteur: number, decalage: number }} px
 */
export function geometrieFeuille({ hauteurVisible, decalageHaut = 0, hauteurFenetre }) {
  const h = Number.isFinite(hauteurVisible) && hauteurVisible > 0 ? hauteurVisible : hauteurFenetre;
  const haut = Number.isFinite(decalageHaut) ? Math.max(0, decalageHaut) : 0;
  return {
    hauteur: Math.round(Math.max(120, h)),
    // Never push the sheet beyond the room the keyboard left.
    decalage: Math.round(Math.min(haut, Math.max(0, hauteurFenetre - h))),
  };
}

/** Scrolling down more than this hides the robot; any scroll up shows it again. */
export const SEUIL_DEFILEMENT_PX = 24;

/**
 * Should the robot button be hidden? Down = hide, up = show, small moves and the very top of
 * the page change nothing (except at the top, where it is always shown).
 * @returns {{ cache: boolean, repere: number }} `repere`: the position to compare with next time
 */
export function visibiliteRobot({ cache, repere, y }) {
  if (y <= 0) return { cache: false, repere: 0 };
  if (y - repere > SEUIL_DEFILEMENT_PX) return { cache: true, repere: y };
  if (repere - y > 4) return { cache: false, repere: y };
  return { cache, repere };
}
