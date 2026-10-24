function gelerProfond(objet) {
  if (objet && typeof objet === "object" && !Object.isFrozen(objet)) {
    Object.freeze(objet);
    Object.values(objet).forEach(gelerProfond);
  }
  return objet;
}

/**
 * Central store: actions -> pure reducer -> new state -> subscribers.
 * In development the state is deep-frozen to catch accidental mutations.
 */
export function creerStore(etatDeDepart, reducteur, { geler = import.meta.env.DEV } = {}) {
  let etat = geler ? gelerProfond(etatDeDepart) : etatDeDepart;
  const abonnes = new Set();
  return {
    lire: () => etat,
    envoyer(action) {
      const suivant = reducteur(etat, action);
      if (suivant !== etat) {
        etat = geler ? gelerProfond(suivant) : suivant;
        abonnes.forEach((f) => f(etat, action));
      }
    },
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
}
