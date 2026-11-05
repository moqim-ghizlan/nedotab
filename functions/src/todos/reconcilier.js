/**
 * V6.4: daily reconciliation of the todos. For a bounded number of users per run (a cursor in
 * config/reconciliationTodos): recounts subjects, todos and the bytes of the pictures, rewrites
 * the counters of the account and of each subject, and deletes the ORPHAN files (a file under
 * todos/{uid}/ that no todo points to: a failed add, a todo deleted from a device that died).
 * A recent file (less than an hour) is left alone: its add may be in progress. A todo whose
 * file is gone is only counted. Volumes only in the result: never a title, a note or a path.
 */
export const UTILISATEURS_PAR_PASSAGE = 50;
export const DELAI_ORPHELIN_MS = 60 * 60 * 1000;
const REF_CURSEUR = "config/reconciliationTodos";

/**
 * @param {object} d
 * @param {import("firebase-admin/firestore").Firestore} d.db
 * @param {{ lister: (uid: string) => Promise<{ nom: string, ageMs: number }[]>, supprimer: (chemin: string) => Promise<void> }} d.stockage
 * @param {number} [d.max]
 * @returns {Promise<{ utilisateurs: number, orphelins: number, corriges: number, sansFichier: number }>}
 */
export async function reconcilierTodos({ db, stockage, max = UTILISATEURS_PAR_PASSAGE }) {
  const curseur = (await db.doc(REF_CURSEUR).get()).data()?.apres ?? null;
  let q = db.collection("users").orderBy("__name__").limit(max);
  if (curseur) q = q.startAfter(curseur);
  const s = await q.get();
  const bilan = { utilisateurs: 0, orphelins: 0, corriges: 0, sansFichier: 0 };
  for (const u of s.docs) {
    const uid = u.id;
    const [sujets, todos] = await Promise.all([
      db.collection(`users/${uid}/sujets`).get(),
      db.collection(`users/${uid}/todos`).get(),
    ]);
    let octets = 0;
    const chemins = new Set();
    const parSujet = new Map(); // subject id → { total, restants }
    for (const d of todos.docs) {
      const t = d.data();
      const c = parSujet.get(t.sujetId) ?? { total: 0, restants: 0 };
      c.total++;
      if (t.fait !== true) c.restants++;
      parSujet.set(t.sujetId, c);
      for (const image of Array.isArray(t.images) ? t.images : []) {
        if (typeof image?.chemin !== "string") continue;
        octets += Number.isFinite(image.taille) ? image.taille : 0;
        chemins.add(image.chemin);
        chemins.add(image.chemin.replace(/\.([a-z0-9]+)$/i, "_mini.$1"));
      }
    }
    const fichiers = await stockage.lister(uid);
    const noms = new Set(fichiers.map((f) => f.nom));
    for (const f of fichiers) {
      if (!chemins.has(f.nom) && f.ageMs >= DELAI_ORPHELIN_MS) {
        await stockage.supprimer(f.nom);
        bilan.orphelins++;
      }
    }
    bilan.sansFichier += [...chemins].filter((c) => !/_mini\.[a-z0-9]+$/i.test(c) && !noms.has(c)).length;
    // Counters of each subject.
    for (const d of sujets.docs) {
      const c = parSujet.get(d.id) ?? { total: 0, restants: 0 };
      const x = d.data();
      if (x.nbTotal !== c.total || x.nbRestants !== c.restants) {
        await d.ref.set({ nbTotal: c.total, nbRestants: c.restants }, { merge: true });
        bilan.corriges++;
      }
    }
    // Counters of the account.
    const ref = db.doc(`users/${uid}/todosMeta/usage`);
    const avant = (await ref.get()).data();
    const voulu = { nbSujets: sujets.size, nbTodos: todos.size, octets };
    if (sujets.size > 0 || todos.size > 0 || avant) {
      if (avant?.nbSujets !== voulu.nbSujets || avant?.nbTodos !== voulu.nbTodos || (avant?.octets ?? 0) !== octets) {
        await ref.set(voulu);
        bilan.corriges++;
      }
    }
    bilan.utilisateurs++;
  }
  // End of the list: start again from the beginning next time.
  await db.doc(REF_CURSEUR).set({ apres: s.size < max ? null : s.docs.at(-1).id });
  return bilan;
}
