/**
 * What the user can type and point with (V3.9) — never which device it is. These change
 * while the app is open (a keyboard or a trackpad plugged in or out), so they are read
 * again on every change.
 */

/** Keys that a virtual keyboard never sends: a physical keyboard is there. */
const TOUCHES_CLAVIER =
  /^(Tab|Escape|Arrow(Up|Down|Left|Right)|F\d{1,2}|Home|End|PageUp|PageDown)$/;

/** True for a key event that proves a physical keyboard (modifier shortcut, Tab, arrows…). */
export function toucheDeClavierPhysique(e) {
  return !!(
    e &&
    e.isTrusted !== false &&
    (e.ctrlKey || e.metaKey || e.altKey || TOUCHES_CLAVIER.test(e.key))
  );
}

/**
 * Capabilities from the media queries and the keyboard seen so far.
 * @param {{ survol: boolean, pointeurFin: boolean, clavierVu: boolean }} etat
 */
export function capacitesEntree({ survol, pointeurFin, clavierVu }) {
  const pointeur = survol || pointeurFin;
  return {
    /** A mouse or a trackpad is attached: hover effects, secondary click. */
    pointeur,
    /** A physical keyboard is probable: the "(/)" hint and the shortcuts help make sense. */
    clavier: clavierVu || pointeur,
  };
}

/**
 * Which menu a secondary action opens: the touch sheet for a finger or a pen, the mouse
 * menu for a mouse or a trackpad. A click without a pointer (keyboard, VoiceOver) follows
 * the screen: no hover means the touch presentation.
 * @returns {"tactile"|"souris"}
 */
export function menuPourPointeur(pointerType, { sansSurvol = false } = {}) {
  if (pointerType === "touch" || pointerType === "pen") return "tactile";
  if (pointerType === "mouse") return "souris";
  return sansSurvol ? "tactile" : "souris";
}

/**
 * Follows the capabilities live; `ecouter(f)` is called with the current ones at once and on
 * each change. `mm` and `cible` can be replaced in tests.
 */
export function suivreEntrees({ mm = globalThis.matchMedia, cible = document } = {}) {
  const survol = mm?.("(hover: hover)");
  const fin = mm?.("(pointer: fine), (any-pointer: fine)");
  let clavierVu = false;
  const abonnes = new Set();
  const lire = () =>
    capacitesEntree({
      survol: !!survol?.matches,
      pointeurFin: !!fin?.matches,
      clavierVu,
    });
  let courant = lire();
  const maj = () => {
    const suivant = lire();
    if (suivant.pointeur === courant.pointeur && suivant.clavier === courant.clavier) return;
    courant = suivant;
    for (const f of abonnes) f(courant);
  };
  survol?.addEventListener?.("change", maj);
  fin?.addEventListener?.("change", maj);
  cible.addEventListener("keydown", (e) => {
    if (clavierVu || !toucheDeClavierPhysique(e)) return;
    clavierVu = true;
    maj();
  });
  return {
    lire: () => courant,
    ecouter(f) {
      abonnes.add(f);
      f(courant);
      return () => abonnes.delete(f);
    },
  };
}

let partage;
/** The capabilities of this session (one observer for the whole app). */
export const entrees = () => (partage ??= suivreEntrees());
