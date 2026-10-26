/**
 * Long press on a tile with the finger (V3.5), as on the iPhone's home screen. The drag
 * itself is SortableJS (glisser.js); this module only tells apart the three gestures and
 * lifts the tile:
 * - the finger moves more than SEUIL_MOUVEMENT_PX before DELAI_APPUI_LONG_MS: scroll or swipe;
 * - the finger stays still for DELAI_APPUI_LONG_MS: "appui long sans mouvement" (the tile is
 *   lifted and the `appuilong` event is fired on it, for the context menu of V3.6);
 * - the finger then moves: the drag starts (SortableJS) and the menu, if any, closes.
 */
export const DELAI_APPUI_LONG_MS = 400;
export const SEUIL_MOUVEMENT_PX = 8;

/**
 * Pure decision on a touch gesture.
 * @param {{ dureeMs: number, deplacementPx: number }} geste time since the touch started and
 *        distance moved since then
 * @returns {"attente"|"defilement"|"menu"|"glisser"}
 */
export function etatGeste({ dureeMs, deplacementPx }) {
  if (dureeMs < DELAI_APPUI_LONG_MS)
    return deplacementPx > SEUIL_MOUVEMENT_PX ? "defilement" : "attente";
  return deplacementPx > SEUIL_MOUVEMENT_PX ? "glisser" : "menu";
}

/**
 * @param {HTMLElement} conteneur
 * @returns {() => void} unplugs the listeners
 */
export function brancherAppuiLong(conteneur) {
  let appui = null; // { id, x, y, tuile, minuteur, leve }

  const finir = () => {
    if (!appui) return;
    clearTimeout(appui.minuteur);
    appui.tuile.classList.remove("tuile--soulevee");
    appui = null;
  };

  const debut = (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    const tuile = e.target.closest?.(".case--element .tuile[data-id]");
    if (!tuile) return;
    finir();
    appui = { id: e.pointerId, x: e.clientX, y: e.clientY, tuile, leve: false, minuteur: 0 };
    appui.minuteur = setTimeout(() => {
      if (!appui) return;
      appui.leve = true;
      tuile.classList.add("tuile--soulevee");
      tuile.dispatchEvent(new CustomEvent("appuilong", { bubbles: true }));
    }, DELAI_APPUI_LONG_MS);
  };

  const deplacer = (e) => {
    if (!appui || e.pointerId !== appui.id) return;
    const deplacement = Math.hypot(e.clientX - appui.x, e.clientY - appui.y);
    if (deplacement <= SEUIL_MOUVEMENT_PX) return;
    // Scroll or swipe before the delay; after it, SortableJS takes over (drag).
    if (appui.leve)
      appui.tuile.dispatchEvent(new CustomEvent("appuilongannule", { bubbles: true }));
    finir();
  };

  conteneur.addEventListener("pointerdown", debut);
  conteneur.addEventListener("pointermove", deplacer);
  for (const type of ["pointerup", "pointercancel"]) conteneur.addEventListener(type, finir);
  return () => {
    finir();
    conteneur.removeEventListener("pointerdown", debut);
    conteneur.removeEventListener("pointermove", deplacer);
    for (const type of ["pointerup", "pointercancel"]) conteneur.removeEventListener(type, finir);
  };
}
