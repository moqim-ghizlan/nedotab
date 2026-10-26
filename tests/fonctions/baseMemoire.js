/**
 * In-memory stand-in for the parts of the Admin Firestore the functions use: doc().get/set
 * and runTransaction. Transactions run one after the other, as Firestore guarantees for
 * conflicting writes on one document.
 */
export function baseMemoire(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  let file = Promise.resolve();
  const instantane = (chemin) => ({
    exists: docs.has(chemin),
    data: () => structuredClone(docs.get(chemin)),
  });
  const doc = (chemin) => ({
    chemin,
    get: async () => instantane(chemin),
    set: async (valeur) => void docs.set(chemin, structuredClone(valeur)),
  });
  return {
    doc,
    runTransaction(fn) {
      const suite = file.then(() =>
        fn({
          get: async (ref) => instantane(ref.chemin),
          set: (ref, valeur) => void docs.set(ref.chemin, structuredClone(valeur)),
        }),
      );
      file = suite.catch(() => {});
      return suite;
    },
    lire: (chemin) => docs.get(chemin),
    brut: () => JSON.stringify(Object.fromEntries(docs)),
  };
}
