/**
 * V4.21 — usage ranking of the sites for the search bar (and the row of V4.22). The statistics
 * come from the database (signed in) or from the local ones (signed out); the ranking is
 * computed once per load, not on each key.
 */
import { classementUsage, normaliserStats } from "../../core/usage.js";

export function creerServiceUsage({ store, uid, charger, visites, actif }) {
  let stats = normaliserStats(null);
  let classement = [];
  const abonnes = new Set();
  const maintenant = () => Date.now();

  const recalculer = () => {
    classement = actif() ? classementUsage(stats, store.lire().grille, maintenant()) : [];
    for (const f of abonnes) f(classement);
  };

  /** Reads the statistics (cache first: instant) and recomputes the ranking. */
  async function actualiser() {
    if (!actif()) {
      stats = normaliserStats(null);
      return recalculer();
    }
    try {
      const u = uid();
      if (u) stats = normaliserStats(await (await charger()).lireVisites(u));
      else stats = await visites.lireLocales();
    } catch {
      /* the ranking is a comfort: the search keeps working by relevance alone */
    }
    recalculer();
  }

  return {
    actualiser,
    recalculer,
    classement: () => classement,
    stats: () => stats,
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
}
