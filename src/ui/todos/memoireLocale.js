/**
 * What the panel remembers ON THIS DEVICE only (V6.8): the last subject opened and the last
 * filter / sort. Identifiers and menu choices, never a title or a text. localStorage can be
 * missing or throw (private window, blocked data): everything works without it.
 */
const PREFIXE = "nedotab:todos:";

export function lireLocal(cle) {
  try {
    return globalThis.localStorage?.getItem(PREFIXE + cle) ?? null;
  } catch {
    return null;
  }
}

export function ecrireLocal(cle, valeur) {
  try {
    if (valeur == null) globalThis.localStorage?.removeItem(PREFIXE + cle);
    else globalThis.localStorage?.setItem(PREFIXE + cle, String(valeur));
  } catch {
    /* a convenience only */
  }
}
