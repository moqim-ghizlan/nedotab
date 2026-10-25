import { etatMoletteInitial, traiterMolette } from "../../core/molette.js";

/** Elements that keep the wheel for themselves (they scroll, or sit over the pages). */
const HORS_PAGES = "dialog, [role='menu'], .recherche-resultats, .reglages, .toasts";

/** True when `noeud` or a parent can still scroll in the direction of `delta`. */
function peutDefiler(noeud, deltaX, deltaY) {
  for (let n = noeud; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const vertical = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight;
    const horizontal = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth;
    if (
      vertical &&
      ((deltaY > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) ||
        (deltaY < 0 && n.scrollTop > 0))
    )
      return true;
    if (
      horizontal &&
      ((deltaX > 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1) ||
        (deltaX < 0 && n.scrollLeft > 0))
    )
      return true;
  }
  return false;
}

/**
 * Mouse wheel and trackpad turn the home pages (V2.11), one page per gesture (see
 * core/molette.js). Not taken: Ctrl/Cmd + wheel (zoom), over something that scrolls or
 * sits over the pages, or while a modal window (folder, dialog) is open.
 */
export function brancherMolette({ actif, allerRelatif, hauteurPage }) {
  let etat = etatMoletteInitial();
  const surMolette = (e) => {
    if (!actif() || document.querySelector("dialog[open]:modal")) return;
    if (e.target.closest?.(HORS_PAGES) || peutDefiler(e.target, e.deltaX, e.deltaY)) return;
    const r = traiterMolette(
      etat,
      {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        temps: e.timeStamp,
      },
      { hauteurPage: hauteurPage() },
    );
    etat = r.etat;
    if (!r.intercepter) return;
    e.preventDefault();
    if (r.sens) allerRelatif(r.sens);
  };
  // passive: false, otherwise preventDefault() is ignored and the page scrolls anyway.
  window.addEventListener("wheel", surMolette, { passive: false });
  return () => window.removeEventListener("wheel", surMolette);
}
