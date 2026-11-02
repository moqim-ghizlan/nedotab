/**
 * V4.27: daily reconciliation of the sharing space. For a bounded number of users per run
 * (a cursor in config/reconciliationEspacePartage): recounts the documents and their bytes,
 * rewrites the counters, and deletes the ORPHAN files (a file under partages/{uid}/ that no
 * document points to). A document whose file is gone is reported, not deleted (the user sees
 * "fichier introuvable" and can delete it). Volumes only in the result.
 */
export const UTILISATEURS_PAR_PASSAGE = 50;
const REF_CURSEUR = "config/reconciliationEspacePartage";

/**
 * @param {object} d
 * @param {import("firebase-admin/firestore").Firestore} d.db
 * @param {{ lister: (uid: string) => Promise<string[]>, supprimer: (chemin: string) => Promise<void> }} d.stockage
 * @param {number} [d.max]
 * @returns {Promise<{ utilisateurs: number, orphelins: number, corriges: number, sansFichier: number }>}
 */
export async function reconcilierEspacePartage({ db, stockage, max = UTILISATEURS_PAR_PASSAGE }) {
  const curseur = (await db.doc(REF_CURSEUR).get()).data()?.apres ?? null;
  let q = db.collection("users").orderBy("__name__").limit(max);
  if (curseur) q = q.startAfter(curseur);
  const s = await q.get();
  const bilan = { utilisateurs: 0, orphelins: 0, corriges: 0, sansFichier: 0 };
  for (const u of s.docs) {
    const uid = u.id;
    const docs = await db.collection(`users/${uid}/espacePartage`).get();
    let nb = 0;
    let octets = 0;
    const chemins = new Set();
    for (const d of docs.docs) {
      const e = d.data();
      nb++;
      if (e.type === "fichier") {
        octets += Number.isFinite(e.taille) ? e.taille : 0;
        if (typeof e.chemin === "string") chemins.add(e.chemin);
      }
    }
    const fichiers = await stockage.lister(uid);
    for (const chemin of fichiers) {
      if (!chemins.has(chemin)) {
        await stockage.supprimer(chemin);
        bilan.orphelins++;
      }
    }
    bilan.sansFichier += [...chemins].filter((c) => !fichiers.includes(c)).length;
    const ref = db.doc(`users/${uid}/espacePartageMeta/usage`);
    const avant = (await ref.get()).data();
    if (nb > 0 || avant) {
      if (avant?.nb !== nb || (avant?.octets ?? 0) !== octets) {
        await ref.set({ nb, octets });
        bilan.corriges++;
      }
    }
    bilan.utilisateurs++;
  }
  // End of the list: start again from the beginning next time.
  await db.doc(REF_CURSEUR).set({ apres: s.size < max ? null : s.docs.at(-1).id });
  return bilan;
}
