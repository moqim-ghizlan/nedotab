/**
 * Safety net of the drag and drop (TODO 14). On an iPhone a drag can be cut without SortableJS
 * ever calling onEnd (touchcancel, a system gesture, the page hidden, a release during a scroll):
 * the dragged copy stays in <body>, above the grid, until the page is reloaded.
 *
 * `nettoyerGlisser` removes what a finished drag leaves behind: orphan copies, the classes of the
 * chosen / ghost / dragged tile, their inline styles, the page-wide flag. Idempotent and without
 * effect on a page where no drag has happened. It must never run during a real drag.
 */
export const COPIES = ".sortable-fallback, .case--glissee";
export const CLASSES = ["case--fantome", "case--choisie", "case--glissee", "sortable-ghost", "sortable-chosen", "sortable-drag", "sortable-fallback"];
const STYLES = ["transform", "opacity", "position", "pointer-events", "z-index", "width", "height", "top", "left", "--icone"];

/** @returns {number} how many orphan copies were removed */
export function nettoyerGlisser(racine = document) {
  let copies = 0;
  // 1. Copies living in <body> (fallbackOnBody) or in the top layer (popover over a folder window).
  for (const copie of racine.querySelectorAll("body > .sortable-fallback, body > .case--glissee, .sortable-fallback")) {
    try {
      if (copie.matches?.(":popover-open")) copie.hidePopover?.();
    } catch {
      /* already closed */
    }
    copie.remove();
    copies++;
  }
  // 2. Classes and inline styles left on tiles of the grid.
  const sel = CLASSES.filter((c) => c !== "sortable-fallback")
    .map((c) => `.${c}`)
    .join(", ");
  for (const caseEl of racine.querySelectorAll(sel)) {
    caseEl.classList.remove(...CLASSES);
    for (const p of STYLES) caseEl.style?.removeProperty(p);
    caseEl.querySelector?.(".tuile")?.style?.removeProperty("zoom");
  }
  racine.body?.classList.remove("glisser-en-cours");
  racine.documentElement?.classList.remove("glisser-en-cours");
  return copies;
}
