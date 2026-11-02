/**
 * V4.27: scheduled cleanup of the sharing space. Deletes expired items, FILE FIRST then
 * document (a missing file is not an error, so a run can always start again), by batches of
 * 200, under a light lock, and keeps the counters (nb, octets) exact. Idempotent.
 * Logs carry VOLUMES only: never a name, a path or a content.
 */
export const LOT = 200;
export const VERROU_MS = 5 * 60_000;
const REF_VERROU = "config/nettoyageEspacePartage";

/**
 * @param {object} d
 * @param {import("firebase-admin/firestore").Firestore} d.db
 * @param {{ supprimerFichier: (chemin: string) => Promise<void> }} d.stockage must not throw when the file is absent
 * @param {{ increment: (n: number) => unknown, timestamp: (ms: number) => unknown }} d.valeurs FieldValue / Timestamp helpers
 * @param {() => number} [d.maintenant]
 * @param {number} [d.budgetMs] time after which the run stops and the next one resumes
 * @returns {Promise<{ elements: number, octets: number, verrouille?: boolean }>}
 */
export async function nettoyerEspacePartage({
  db,
  stockage,
  valeurs,
  maintenant = Date.now,
  budgetMs = 70_000,
}) {
  const debut = maintenant();
  // Light lock: two runs at once would only fight over the same documents.
  const verrouille = await db.runTransaction(async (t) => {
    const ref = db.doc(REF_VERROU);
    const s = await t.get(ref);
    if (s.exists && (s.data().jusqua ?? 0) > debut) return true;
    t.set(ref, { jusqua: debut + VERROU_MS });
    return false;
  });
  if (verrouille) return { elements: 0, octets: 0, verrouille: true };

  let elements = 0;
  let octets = 0;
  try {
    for (;;) {
      if (maintenant() - debut > budgetMs) break;
      const s = await db
        .collectionGroup("espacePartage")
        .where("expireLe", "<=", valeurs.timestamp(maintenant()))
        .limit(LOT)
        .get();
      if (s.empty) break;
      for (const doc of s.docs) {
        const e = doc.data();
        const taille = e.type === "fichier" && Number.isFinite(e.taille) ? e.taille : 0;
        if (e.type === "fichier" && typeof e.chemin === "string")
          await stockage.supprimerFichier(e.chemin);
        const uid = doc.ref.parent.parent.id;
        const lot = db.batch();
        lot.delete(doc.ref);
        lot.set(
          db.doc(`users/${uid}/espacePartageMeta/usage`),
          { nb: valeurs.increment(-1), ...(taille ? { octets: valeurs.increment(-taille) } : {}) },
          { merge: true },
        );
        await lot.commit();
        elements++;
        octets += taille;
      }
      if (s.size < LOT) break;
    }
  } finally {
    await db.doc(REF_VERROU).set({ jusqua: 0 });
  }
  return { elements, octets };
}
