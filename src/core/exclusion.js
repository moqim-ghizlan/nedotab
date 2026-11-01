/**
 * Elements hidden from the AI (V4.20): "Ne pas montrer à l'IA" sets `iaExclu: true` on a site or a
 * folder; everything inside an excluded folder is hidden too. Pure.
 */
import { trouver } from "./arbre.js";

/** True when the element, or any folder above it, is excluded. */
export function estExclu(grille, id) {
  const r = trouver(grille ?? [], id);
  if (!r) return false;
  return r.element.iaExclu === true || r.chemin.some((d) => d.iaExclu === true);
}

/** Ids of every excluded element, content of the excluded folders included. */
export function idsExclus(grille) {
  const ids = new Set();
  const visiter = (liste, exclu) => {
    for (const e of Array.isArray(liste) ? liste : []) {
      const ici = exclu || e?.iaExclu === true;
      if (ici && e?.id) ids.add(e.id);
      if (e?.type === "dossier") visiter(e.items, ici);
    }
  };
  visiter(grille, false);
  return ids;
}

/** How many sites are hidden from the AI (for the settings). */
export function compterSitesExclus(grille) {
  const exclus = idsExclus(grille);
  let n = 0;
  const visiter = (liste) => {
    for (const e of Array.isArray(liste) ? liste : []) {
      if (e?.type === "site" && exclus.has(e.id)) n++;
      else if (e?.type === "dossier") visiter(e.items);
    }
  };
  visiter(grille);
  return n;
}
