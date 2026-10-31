/**
 * In-memory stand-in for the parts of the Admin Firestore the functions use: doc().get/set/
 * update/delete, runTransaction, and (V4.15) collections: collection().orderBy().limit().get(),
 * count(), batch(), recursiveDelete(). Transactions run one after the other, as Firestore
 * guarantees for conflicting writes on one document.
 */
export function baseMemoire(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  let file = Promise.resolve();
  const valeur = (v) => (v instanceof Date ? v.getTime() : v);
  const instantane = (chemin) => ({
    id: chemin.split("/").at(-1),
    ref: doc(chemin),
    exists: docs.has(chemin),
    data: () => structuredClone(docs.get(chemin)),
  });
  const ecrire = (chemin, v) => void docs.set(chemin, structuredClone(v));
  const fusionner = (chemin, v) => {
    if (!docs.has(chemin)) throw new Error(`update d'un document absent : ${chemin}`);
    docs.set(chemin, { ...docs.get(chemin), ...structuredClone(v) });
  };
  const sousChemins = (chemin) =>
    [...docs.keys()].filter((k) => k === chemin || k.startsWith(`${chemin}/`));
  function doc(chemin) {
    return {
      chemin,
      id: chemin.split("/").at(-1),
      get: async () => instantane(chemin),
      set: async (v) => ecrire(chemin, v),
      update: async (v) => fusionner(chemin, v),
      delete: async () => void docs.delete(chemin),
    };
  }
  function collection(chemin, { champ = null, sens = "asc", max = null } = {}) {
    const lister = () => {
      let liste = [...docs.keys()]
        .filter((k) => k.startsWith(`${chemin}/`) && !k.slice(chemin.length + 1).includes("/"))
        .map(instantane);
      if (champ) {
        const cle = (s) => valeur(s.data()[champ]);
        liste.sort((a, b) => (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : a.id < b.id ? -1 : 1));
        if (sens === "desc") liste.reverse();
      }
      if (max != null) liste = liste.slice(0, max);
      return liste;
    };
    return {
      doc: (id) => doc(`${chemin}/${id}`),
      orderBy: (c, s = "asc") => collection(chemin, { champ: c, sens: s, max }),
      limit: (n) => collection(chemin, { champ, sens, max: n }),
      get: async () => {
        const liste = lister();
        return { docs: liste, size: liste.length, empty: liste.length === 0 };
      },
      count: () => ({ get: async () => ({ data: () => ({ count: lister().length }) }) }),
    };
  }
  return {
    doc,
    collection: (chemin) => collection(chemin),
    batch() {
      const operations = [];
      const lot = {
        set: (ref, v) => (operations.push(() => ecrire(ref.chemin, v)), lot),
        update: (ref, v) => (operations.push(() => fusionner(ref.chemin, v)), lot),
        delete: (ref) => (operations.push(() => docs.delete(ref.chemin)), lot),
        commit: async () => void operations.forEach((o) => o()),
      };
      return lot;
    },
    recursiveDelete: async (ref) => void sousChemins(ref.chemin).forEach((k) => docs.delete(k)),
    runTransaction(fn) {
      const suite = file.then(() =>
        fn({
          get: async (ref) => instantane(ref.chemin),
          set: (ref, v) => void ecrire(ref.chemin, v),
        }),
      );
      file = suite.catch(() => {});
      return suite;
    },
    lire: (chemin) => docs.get(chemin),
    chemins: (prefixe = "") => [...docs.keys()].filter((k) => k.startsWith(prefixe)),
    brut: () => JSON.stringify(Object.fromEntries(docs)),
  };
}
