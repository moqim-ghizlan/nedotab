/**
 * A new version of the web app waits to be applied (V3.7 banner). The banner can be closed
 * ("Plus tard"): this small state lets the account card of the settings offer the same
 * "Mettre à jour" later, so the user can always find it. No DOM, no service worker here.
 */
let etat = { disponible: false, appliquer: null };
const abonnes = new Set();

export const lireMiseAJour = () => etat;

/** @returns {() => void} the way to stop listening */
export function abonnerMiseAJour(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** @param {{ disponible: boolean, appliquer: (() => Promise<void>) | null }} suivant */
export function definirMiseAJour(suivant) {
  etat = suivant;
  for (const f of abonnes) f();
}
