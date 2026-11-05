/**
 * Conflicts between devices on a todo (V6.7). Pure.
 *
 * Every update sends ONLY the fields that changed, so two devices that change different fields
 * merge by themselves. On the SAME field the last write wins (Firestore replays the writes in
 * order); the screen must then never lose a text silently:
 *   - a field being typed (focus, IME composition, text waiting to be sent) is never replaced:
 *     the editor shows a banner and lets the user keep their version or take the other one;
 *   - a free field that another device changed is replaced, and the text that was on screen is
 *     kept for ten minutes IN MEMORY (never written to the storage of the device) so that
 *     "Voir ma version" can bring it back.
 */
export const DUREE_MEMOIRE_MS = 10 * 60 * 1000;

/**
 * @param {object} d
 * @param {string} d.local value on screen
 * @param {string} d.distante value just received from the server
 * @param {string} d.base value of the previous snapshot (what the screen was last in line with)
 * @param {string} [d.envoye] last value this editor sent (its own echo is not a conflict)
 * @param {boolean} d.occupe focus, composition or text waiting to be sent
 * @param {(v: string) => string} [d.normaliser] the stored form of a typed value (a title is trimmed)
 * @returns {"aucun"|"conflit"|"remplace"}
 */
export function decider({ local, distante, base, envoye, occupe, normaliser = (v) => v }) {
  if (normaliser(local) === distante) return "aucun"; // already the same
  if (distante === base) return "aucun"; // the server did not change: our edit is on its way
  if (envoye !== undefined && distante === envoye) return "aucun"; // the echo of our own write
  return occupe ? "conflit" : "remplace";
}

/**
 * The versions replaced by another device, kept in memory for ten minutes.
 * @param {() => number} [maintenant]
 */
export function creerMemoire(maintenant = () => Date.now()) {
  const garde = new Map();
  const cle = (id, champ) => `${id}\u0000${champ}`;
  const purger = () => {
    const t = maintenant();
    for (const [k, v] of garde) if (v.jusqua <= t) garde.delete(k);
  };
  return {
    garder(id, champ, valeur) {
      purger();
      garde.set(cle(id, champ), { valeur, jusqua: maintenant() + DUREE_MEMOIRE_MS });
    },
    lire(id, champ) {
      purger();
      return garde.get(cle(id, champ))?.valeur;
    },
    oublier(id, champ) {
      garde.delete(cle(id, champ));
    },
    /** Nothing survives a sign-out. */
    vider: () => garde.clear(),
    taille: () => (purger(), garde.size),
  };
}

/** One memory for the whole session of the page. */
export const memoireSession = creerMemoire();
