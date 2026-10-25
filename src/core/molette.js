/**
 * Mouse wheel and trackpad → one page per gesture (V2.11). Pure: the caller passes each
 * `wheel` event (with its time) and the previous state, and acts on the result.
 *
 * - The dominant axis counts (deltaX for a horizontal trackpad swipe), lines and pages are
 *   converted to pixels.
 * - Deltas add up until SEUIL_PX: then one page, the total is reset and the wheel is locked
 *   for VERROU_MS.
 * - After the lock, a trackpad keeps sending decaying deltas (inertia): they are ignored
 *   until a pause (PAUSE_MS) or a clearly stronger delta, the sign of a new gesture.
 * - Ctrl/Cmd + wheel is the browser's zoom: never taken.
 */
export const SEUIL_PX = 60;
export const VERROU_MS = 450;
export const PAUSE_MS = 120;
export const RELANCE = 1.3;

const PIXELS_PAR_LIGNE = 16;

export const etatMoletteInitial = () => ({
  total: 0,
  verrouJusqua: 0,
  inertie: false,
  dernier: null,
});

/** Signed distance of the event along its dominant axis, in pixels. */
export function deltaDominant({ deltaX = 0, deltaY = 0, deltaMode = 0 }, hauteurPage = 800) {
  const d = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  return deltaMode === 1 ? d * PIXELS_PAR_LIGNE : deltaMode === 2 ? d * hauteurPage : d;
}

/**
 * @param {{ total: number, verrouJusqua: number, inertie: boolean, dernier: {t: number, d: number}|null }} etat
 * @param {{ deltaX?: number, deltaY?: number, deltaMode?: number, ctrlKey?: boolean, metaKey?: boolean, temps: number }} evt
 * @returns {{ etat: object, intercepter: boolean, sens: -1|0|1 }} sens: page to go to
 *   relative to the current one; intercepter false: leave the event to the browser.
 */
export function traiterMolette(etat, evt, { hauteurPage = 800 } = {}) {
  if (evt.ctrlKey || evt.metaKey) return { etat, intercepter: false, sens: 0 };
  const d = deltaDominant(evt, hauteurPage);
  const t = evt.temps;
  const precedent = etat.dernier;
  const dernier = { t, d: Math.abs(d) };
  if (d === 0) return { etat: { ...etat, dernier }, intercepter: true, sens: 0 };

  if (t < etat.verrouJusqua) return { etat: { ...etat, dernier }, intercepter: true, sens: 0 };

  let inertie = etat.inertie;
  if (inertie) {
    const pause = !precedent || t - precedent.t > PAUSE_MS;
    const relance = precedent && Math.abs(d) > precedent.d * RELANCE;
    if (!pause && !relance) return { etat: { ...etat, dernier }, intercepter: true, sens: 0 };
    inertie = false;
  }

  // A pause also forgets what was gathered before it.
  const total = (precedent && t - precedent.t > PAUSE_MS ? 0 : etat.total) + d;
  if (Math.abs(total) < SEUIL_PX)
    return { etat: { ...etat, total, inertie, dernier }, intercepter: true, sens: 0 };
  return {
    etat: { total: 0, verrouJusqua: t + VERROU_MS, inertie: true, dernier },
    intercepter: true,
    sens: total > 0 ? 1 : -1,
  };
}
