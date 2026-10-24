/**
 * Size of the account's document (Firestore refuses documents over 1 MiB). Only the synced
 * part counts: the device-only settings are never sent.
 */
export const SEUIL_AVERTISSEMENT = 800 * 1024;
export const SEUIL_BLOCAGE = 950 * 1024;

/** UTF-8 byte length of a string, without any DOM API. */
export function octetsUtf8(texte) {
  let n = 0;
  for (const c of texte) {
    const p = c.codePointAt(0);
    n += p < 0x80 ? 1 : p < 0x800 ? 2 : p < 0x10000 ? 3 : 4;
  }
  return n;
}

export function estimerTaille(etat) {
  return octetsUtf8(
    JSON.stringify({
      versionSchema: etat.versionSchema,
      grille: etat.grille,
      reglages: etat.reglages,
    }),
  );
}

/** "ok" | "avertissement" (800 KB) | "bloque" (950 KB: no more imported icons). */
export function niveauTaille(octets) {
  if (octets >= SEUIL_BLOCAGE) return "bloque";
  if (octets >= SEUIL_AVERTISSEMENT) return "avertissement";
  return "ok";
}
