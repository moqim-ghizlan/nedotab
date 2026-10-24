/**
 * Stable fingerprint of a state (grid + settings): same content → same fingerprint, whatever
 * the order of the object keys or the creation dates. Used to avoid identical backups.
 */
function normaliser(valeur) {
  if (Array.isArray(valeur)) return valeur.map(normaliser);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.keys(valeur)
        .filter((k) => k !== "creeLe")
        .sort()
        .map((k) => [k, normaliser(valeur[k])]),
    );
  }
  return valeur;
}

/** Two 32-bit FNV-1a hashes (different seeds) → 16 hex characters. */
export function empreinte(etat) {
  const texte = JSON.stringify(
    normaliser({ grille: etat?.grille ?? [], reglages: etat?.reglages ?? {} }),
  );
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
