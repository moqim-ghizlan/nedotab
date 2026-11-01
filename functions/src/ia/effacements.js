/**
 * Erasures asked by the user in Settings → AI privacy (V4.20). Each one deletes exactly what it
 * announces and nothing else: the conversations (with their messages), the AI answer cache, the
 * usage statistics. The keys have their own function (iaSupprimerCle) and the tags generated on
 * the grid are erased by the browser (they are in the user's grid).
 */
export const EFFACEMENTS = ["conversations", "cache", "usage", "serveur"];

/** @param {{ db: any }} deps */
export function creerEffacements({ db }) {
  async function viderCollection(chemin, { avecSousCollections = false } = {}) {
    const snap = await db.collection(chemin).get();
    for (const d of snap.docs) {
      if (avecSousCollections) await db.recursiveDelete(d.ref);
      else await d.ref.delete();
    }
    return snap.docs.length;
  }

  /**
   * @param {"conversations"|"cache"|"usage"|"serveur"} quoi "serveur" = the three of them
   * @returns {Promise<{ conversations?: number, cache?: number, usage?: number }>} how many
   *   documents were deleted
   */
  async function effacer(uid, quoi) {
    const tout = quoi === "serveur";
    const sortie = {};
    if (tout || quoi === "conversations")
      sortie.conversations = await viderCollection(`users/${uid}/conversations`, {
        avecSousCollections: true,
      });
    if (tout || quoi === "cache")
      sortie.cache = await viderCollection(`users/${uid}/prive/cacheIa/entrees`);
    if (tout || quoi === "usage") sortie.usage = await viderCollection(`users/${uid}/usage`);
    return sortie;
  }

  return { effacer };
}
