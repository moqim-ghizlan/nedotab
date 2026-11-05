/**
 * Touch gestures of the lists (V6.9): swipe to the left to delete (with "Annuler"), and a long
 * press that opens the menu of the line (iOS Safari never fires `contextmenu` on a long press).
 * Plain Pointer Events, no library. The grip of the line (SortableJS, 300 ms) is left alone, and
 * the vertical scroll stays native: the gesture locks an axis at the first clear move.
 */
export const SEUIL_BALAYAGE_PX = 96;
export const SEUIL_AXE_PX = 10;
export const DELAI_APPUI_LONG_MS = 500;
export const TOLERANCE_APPUI_PX = 8;

/**
 * Pure decision on a move of the finger.
 * @param {{ dx: number, dy: number, axe: "x"|"y"|null }} m total move since the touch, axis lock
 * @returns {{ axe: "x"|"y"|null, decalage: number }} `decalage`: how far the line follows (≤ 0)
 */
export function suivreBalayage({ dx, dy, axe }) {
  let verrou = axe;
  if (!verrou) {
    if (Math.abs(dy) > SEUIL_AXE_PX && Math.abs(dy) >= Math.abs(dx)) verrou = "y";
    // Horizontal only when it is clearly more horizontal than vertical (a diagonal scroll stays a scroll).
    else if (Math.abs(dx) > SEUIL_AXE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) verrou = "x";
  }
  return { axe: verrou, decalage: verrou === "x" ? Math.min(0, dx) : 0 };
}

/** True when the line was dragged far enough to be deleted when the finger is lifted. */
export const balayageValide = (decalage, largeur = 360) =>
  decalage <= -Math.min(SEUIL_BALAYAGE_PX, largeur * 0.4);

/**
 * @param {HTMLElement} liste the `ul` holding the lines (`li[data-id]`)
 * @param {object} d
 * @param {(id: string) => void} [d.surBalayage] swipe to the left, far enough
 * @param {(id: string, x: number, y: number) => void} [d.surAppuiLong]
 * @param {string} [d.exclure] selector of the parts that keep their own gesture (the grip)
 * @returns {() => void} removes the listeners
 */
export function brancherGestes(liste, { surBalayage, surAppuiLong, exclure = ".todo-poignee, .todos-poignee" }) {
  let geste = null;

  const fin = (valider) => {
    if (!geste) return;
    clearTimeout(geste.minuteur);
    const { li, decalage, id } = geste;
    li.style.transition = "";
    li.style.translate = "";
    li.classList.remove("todo-ligne--balayee", "todos-sujet--balayee");
    geste = null;
    if (valider && balayageValide(decalage, li.offsetWidth || 360)) surBalayage?.(id);
  };

  const debut = (e) => {
    if (e.pointerType === "mouse" || (e.button ?? 0) !== 0) return;
    const li = e.target.closest?.("li[data-id]");
    if (!li || !liste.contains(li) || e.target.closest?.(exclure)) return;
    geste = {
      li,
      id: li.dataset.id,
      x: e.clientX,
      y: e.clientY,
      axe: null,
      decalage: 0,
      pointeur: e.pointerId,
      minuteur: surAppuiLong
        ? setTimeout(() => {
            if (!geste || geste.axe) return;
            const { id, x, y } = geste;
            geste.minuteur = null;
            geste.consomme = true;
            // The click that follows the lift must not open the line.
            liste.dataset.appuiLong = "1";
            setTimeout(() => delete liste.dataset.appuiLong, 700);
            surAppuiLong(id, x, y);
          }, DELAI_APPUI_LONG_MS)
        : null,
    };
  };

  const deplacer = (e) => {
    if (!geste || e.pointerId !== geste.pointeur) return;
    const dx = e.clientX - geste.x;
    const dy = e.clientY - geste.y;
    // A finger that moves is not a long press.
    if (Math.hypot(dx, dy) > TOLERANCE_APPUI_PX) clearTimeout(geste.minuteur);
    const r = suivreBalayage({ dx, dy, axe: geste.axe });
    geste.axe = r.axe;
    if (r.axe === "x" && surBalayage) {
      geste.decalage = r.decalage;
      geste.li.classList.add(geste.li.classList.contains("todos-sujet") ? "todos-sujet--balayee" : "todo-ligne--balayee");
      geste.li.style.translate = `${r.decalage}px 0`;
      geste.li.dataset.balayage = balayageValide(r.decalage, geste.li.offsetWidth || 360) ? "pret" : "";
      e.preventDefault?.();
    }
  };

  const leve = () => {
    const consomme = geste?.consomme;
    if (geste) delete geste.li.dataset.balayage;
    fin(!consomme);
  };
  // After a long press the click that follows must not open the line.
  const sansClic = (e) => {
    if (liste.dataset.appuiLong) {
      e.preventDefault();
      e.stopPropagation();
      delete liste.dataset.appuiLong;
    }
  };

  liste.addEventListener("pointerdown", debut);
  liste.addEventListener("pointermove", deplacer);
  liste.addEventListener("pointerup", leve);
  liste.addEventListener("pointercancel", () => fin(false));
  liste.addEventListener("click", sansClic, true);
  return () => {
    liste.removeEventListener("pointerdown", debut);
    liste.removeEventListener("pointermove", deplacer);
    liste.removeEventListener("pointerup", leve);
    liste.removeEventListener("click", sansClic, true);
  };
}
