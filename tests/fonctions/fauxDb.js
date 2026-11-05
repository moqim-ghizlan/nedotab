/**
 * In-memory Firestore (Admin SDK shape), just enough for the share-link functions and the
 * cleanup: doc get/set/update/delete, collection queries with where(==, <=), limit, and
 * transactions that apply their writes at the end (and are serialised, like a real contention).
 */
export function fauxDb(initial = {}) {
  const donnees = new Map(Object.entries(initial));
  let file = Promise.resolve();

  // Like the real Firestore: a document path has an EVEN number of segments.
  const exigerDocument = (chemin) => {
    if (chemin.split("/").length % 2 !== 0)
      throw new Error(`Le chemin doit désigner un document : ${chemin}`);
  };
  const ref = (chemin) => {
    exigerDocument(chemin);
    return {
      path: chemin,
      id: chemin.split("/").at(-1),
      get: async () => ({
        exists: donnees.has(chemin),
        id: chemin.split("/").at(-1),
        data: () => clone(donnees.get(chemin)),
      }),
      set: async (v, o) => ecrire(chemin, v, o?.merge),
      update: async (v) => {
        if (!donnees.has(chemin)) throw new Error("NOT_FOUND");
        ecrire(chemin, v, true);
      },
      delete: async () => void donnees.delete(chemin),
    };
  };
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  const ecrire = (chemin, valeur, fusion) => {
    donnees.set(
      chemin,
      fusion ? { ...(donnees.get(chemin) ?? {}), ...clone(valeur) } : clone(valeur),
    );
  };

  const requete = (chemin, filtres = [], limite = Infinity) => ({
    where: (champ, op, valeur) => requete(chemin, [...filtres, { champ, op, valeur }], limite),
    limit: (n) => requete(chemin, filtres, n),
    get: async () => {
      const profondeur = chemin.split("/").length + 1;
      const chemins = [...donnees.keys()]
        .filter((c) => c.startsWith(`${chemin}/`) && c.split("/").length === profondeur)
        .filter((c) =>
          filtres.every(({ champ, op, valeur }) => {
            const v = donnees.get(c)[champ];
            if (op === "==") return v === valeur;
            if (op === "<=") return v !== undefined && v <= valeur;
            throw new Error(`opérateur non géré : ${op}`);
          }),
        )
        .sort()
        .slice(0, limite);
      return {
        size: chemins.length,
        empty: chemins.length === 0,
        docs: chemins.map((c) => ({
          id: c.split("/").at(-1),
          ref: ref(c),
          data: () => clone(donnees.get(c)),
        })),
      };
    },
  });

  return {
    donnees,
    doc: ref,
    collection: (chemin) => requete(chemin),
    // Serialised: two simultaneous transactions never interleave (the real one retries).
    runTransaction: (f) => {
      const suite = file.then(async () => {
        const ecritures = [];
        const tx = {
          get: (r) => r.get(),
          set: (r, v, o) => ecritures.push(() => ecrire(r.path, v, o?.merge)),
          update: (r, v) => ecritures.push(() => ecrire(r.path, v, true)),
          delete: (r) => ecritures.push(() => donnees.delete(r.path)),
        };
        const resultat = await f(tx);
        ecritures.forEach((e) => e());
        return resultat;
      });
      file = suite.catch(() => {});
      return suite;
    },
  };
}

/** In-memory Storage. */
export function fauxStockage() {
  const fichiers = new Map();
  return {
    fichiers,
    ecrire: async (c, o) => void fichiers.set(c, Buffer.from(o)),
    lire: async (c) => {
      if (!fichiers.has(c)) throw new Error("absent");
      return fichiers.get(c);
    },
    supprimer: async (c) => void fichiers.delete(c),
  };
}
