/**
 * Finger swipe between the home pages (V3.4), as on the iPhone's home screen: the pages
 * follow the finger, and a swipe long or fast enough turns the page. Touch only (the mouse
 * and the trackpad use the wheel, molette.js); a mostly vertical gesture is left alone, and
 * a long press without moving stays the tile's (drag, menu).
 */

/** Movement (px) before the gesture is known as horizontal or vertical. */
const SEUIL = 10;
/** A swipe turns the page past this share of the width, or above this speed (px/ms). */
const PART = 0.2;
const VITESSE = 0.4;

/**
 * @param {HTMLElement} fenetre the pages' clipping box
 * @param {{ actif: () => boolean, peutAller: (sens: number) => boolean,
 *           decaler: (px: number) => void, terminer: (sens: number) => void }} options
 *   decaler: shows the pages moved by px (finger following); terminer: -1 / 1 turns the
 *   page that way, 0 puts it back.
 * @returns {() => void} unplugs the listeners
 */
export function brancherBalayage(fenetre, { actif, peutAller, decaler, terminer }) {
  let geste = null; // { id, x, y, t, sens: null | "horizontal" | "vertical", dx }

  const debut = (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary || !actif()) return;
    geste = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, sens: null, dx: 0 };
  };

  const deplacer = (e) => {
    if (!geste || e.pointerId !== geste.id) return;
    const dx = e.clientX - geste.x;
    const dy = e.clientY - geste.y;
    if (!geste.sens) {
      if (Math.abs(dx) < SEUIL && Math.abs(dy) < SEUIL) return;
      geste.sens = Math.abs(dx) > Math.abs(dy) * 1.2 ? "horizontal" : "vertical";
    }
    if (geste.sens !== "horizontal" || !actif()) return;
    // Past the first or the last page, the pages resist (a third of the movement).
    const versPage = dx < 0 ? 1 : -1;
    geste.dx = peutAller(versPage) ? dx : dx / 3;
    decaler(geste.dx);
  };

  const fin = (e) => {
    if (!geste || e.pointerId !== geste.id) return;
    const { sens, dx, t } = geste;
    geste = null;
    if (sens !== "horizontal") return;
    const vitesse = Math.abs(dx) / Math.max(1, e.timeStamp - t);
    const loin = Math.abs(dx) > fenetre.clientWidth * PART || vitesse > VITESSE;
    const versPage = dx < 0 ? 1 : -1;
    terminer(loin && e.type === "pointerup" && peutAller(versPage) ? versPage : 0);
    // The finger lifted on a tile after a swipe: it is not a tap (the click, if any, comes
    // right after; later taps are left alone).
    const bloquer = (c) => {
      c.preventDefault();
      c.stopPropagation();
    };
    fenetre.addEventListener("click", bloquer, { capture: true, once: true });
    setTimeout(() => fenetre.removeEventListener("click", bloquer, { capture: true }), 400);
  };

  fenetre.addEventListener("pointerdown", debut);
  fenetre.addEventListener("pointermove", deplacer);
  fenetre.addEventListener("pointerup", fin);
  fenetre.addEventListener("pointercancel", fin);
  return () => {
    fenetre.removeEventListener("pointerdown", debut);
    fenetre.removeEventListener("pointermove", deplacer);
    fenetre.removeEventListener("pointerup", fin);
    fenetre.removeEventListener("pointercancel", fin);
  };
}
