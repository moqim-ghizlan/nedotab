/**
 * Catching up the existing sites with tags and descriptions (V4.6): pure rules. Which sites,
 * how many calls, the estimate against the daily quota, and the light lock between devices.
 */

/** A lock with no progress for this long is dead (device closed, app suspended…). */
import { idsExclus } from "./exclusion.js";

export const DUREE_VERROU_MS = 10 * 60 * 1000;

export const PORTEES = ["sansTags", "dossier", "tout"];

/** Sites in display order: the root sites first, then each folder (its sites, then its subfolders). */
function sitesEnOrdre(liste) {
  const sites = liste.filter((e) => e.type === "site");
  const dossiers = liste.filter((e) => e.type === "dossier");
  return [...sites, ...dossiers.flatMap((d) => sitesEnOrdre(d.items ?? []))];
}

const sansTags = (s) =>
  ["aucun", "echec"].includes(s.ia?.etat ?? "aucun") && (s.tags ?? []).length === 0;

/**
 * Ids of the sites to complete. Sites whose tags the user wrote (tagsManuels) are never
 * included.
 * @param {object[]} grille
 * @param {{ portee: "sansTags"|"dossier"|"tout", dossierId?: string }} options
 */
export function sitesARattraper(grille, { portee, dossierId } = {}) {
  let racine = grille ?? [];
  if (portee === "dossier") {
    const trouver = (liste) => {
      for (const e of liste) {
        if (e.type !== "dossier") continue;
        if (e.id === dossierId) return e;
        const dans = trouver(e.items ?? []);
        if (dans) return dans;
      }
      return null;
    };
    racine = trouver(racine)?.items ?? [];
  }
  const exclus = idsExclus(grille ?? []);
  return sitesEnOrdre(racine)
    .filter((s) => !exclus.has(s.id) && !s.tagsManuels && (portee === "tout" || sansTags(s)))
    .map((s) => s.id);
}

/** Every folder of the grid, for the scope choice: [{ id, titre }] in display order. */
export function listeDossiers(grille) {
  const visiter = (liste) =>
    liste.flatMap((e) => (e.type === "dossier" ? [e, ...visiter(e.items ?? [])] : []));
  return visiter(grille ?? []).map((d) => ({ id: d.id, titre: d.titre }));
}

/**
 * What the user is told before starting: one call per site, against what is left of the
 * day's quota. `traitables` is how many can be done today.
 */
export function estimation(nombre, quotaRestant) {
  const restant = Number.isFinite(quotaRestant) ? Math.max(0, quotaRestant) : null;
  const traitables = restant == null ? nombre : Math.min(nombre, restant);
  return { sites: nombre, appels: nombre, quotaRestant: restant, traitables, partiel: traitables < nombre };
}

/** Is another device processing (a lock with recent progress that is not mine)? */
export function verrouAutreAppareil(verrou, monAppareil, maintenant) {
  if (!verrou?.appareil || verrou.appareil === monAppareil) return null;
  return maintenant - (verrou.maj ?? 0) < DUREE_VERROU_MS ? verrou : null;
}

/** Errors that stop the whole processing (the others only fail one site). */
export const ERREURS_BLOQUANTES = [
  "cle-invalide",
  "cle-sans-credit",
  "cle-absente",
  "ia-desactivee",
  "quota-depasse",
  "quota-pages-depasse",
  "pas-de-modele",
];
