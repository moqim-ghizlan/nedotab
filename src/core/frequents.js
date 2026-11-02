/**
 * Row "Les plus utilisés" under the search bar (V4.22). Pure: no DOM, no network.
 * It builds on the usage ranking of V4.21 (classementUsage) and the pinned sites.
 */
import { aplatir } from "./arbre.js";

/** At least this many visits in total, and this many eligible sites, before the row shows. */
export const VISITES_MIN = 10;
export const SITES_MIN = 3;
/** Below this current score a site counts as unused. */
export const SCORE_MIN = 0.1;
export const MASQUES_MAX = 200;

/** Settings of the row: shown, small title, ids hidden from it. Stored only when changed. */
export const FREQUENTS_PAR_DEFAUT = Object.freeze({ afficher: true, titre: false, masques: [] });

/** `reglages.frequents` made valid (unknown keys dropped, ids unique and bounded). */
export function validerFrequents(f) {
  const brut = f && typeof f === "object" ? f : {};
  const vus = new Set();
  const masques = [];
  for (const id of Array.isArray(brut.masques) ? brut.masques : []) {
    if (typeof id !== "string" || !id || id.length > 64 || vus.has(id)) continue;
    vus.add(id);
    masques.push(id);
    if (masques.length === MASQUES_MAX) break;
  }
  return {
    afficher: brut.afficher !== false,
    titre: brut.titre === true,
    masques,
  };
}

/** Same as validerFrequents, but undefined when everything is at its default (not stored). */
export function frequentsAStocker(f) {
  const v = validerFrequents(f);
  return v.afficher && !v.titre && v.masques.length === 0 ? undefined : v;
}

export const frequentsDe = (reglages) => validerFrequents(reglages?.frequents);

/**
 * Number of icons that fit on ONE line of `largeur` px: about 8 on a wide screen, 5 on an
 * iPhone in portrait, 6 or 7 on an iPad. Never less than 3 nor more than 8.
 */
export function nombreIcones(largeur, { icone = 40, marge = 24 } = {}) {
  if (!(largeur > 0)) return 0;
  const n = Math.floor(largeur / (icone + marge + 24));
  return Math.max(3, Math.min(8, n));
}

/**
 * The sites of the row: pinned first (last visit, then title), then by usage score; hidden,
 * vanished and unused sites left out; at most `max`.
 * @returns {{ site: object, chemin: string[] }[]} (empty when the row must not show)
 */
export function sitesFrequents({ grille, classement, reglages, suiviActif = true, max = 8 }) {
  const { masques } = frequentsDe(reglages);
  const caches = new Set(masques);
  const sites = aplatir(grille).filter(({ element }) => element.type === "site");
  const chemins = new Map(sites.map(({ element, chemin }) => [element.id, chemin.map((d) => d.titre)]));
  const parId = new Map((classement ?? []).map((r) => [r.site.id, r]));
  const epingles = sites
    .map(({ element }) => element)
    .filter((s) => s.epingle === true && !caches.has(s.id))
    .sort(
      (a, b) =>
        (parId.get(b.id)?.derniere ?? 0) - (parId.get(a.id)?.derniere ?? 0) ||
        a.titre.localeCompare(b.titre, "fr"),
    );
  const epinglesIds = new Set(epingles.map((s) => s.id));
  const utilises = suiviActif
    ? (classement ?? [])
        .filter((r) => r.score >= SCORE_MIN && !caches.has(r.site.id) && !epinglesIds.has(r.site.id))
        .map((r) => r.site)
    : [];
  const choisis = [...epingles, ...utilises];
  const totalVisites = suiviActif
    ? (classement ?? []).reduce((n, r) => n + (r.compte ?? 0), 0)
    : 0;
  // Pinned sites alone are enough to show the row (3 of them); otherwise it needs real use.
  const assez = epingles.length >= SITES_MIN || (totalVisites >= VISITES_MIN && choisis.length >= SITES_MIN);
  if (!assez) return [];
  return choisis.slice(0, max).map((site) => ({ site, chemin: chemins.get(site.id) ?? [] }));
}

/** Ids removed from the hidden list because the site no longer exists. */
export function masquesObsoletes(reglages, grille) {
  const ids = new Set(aplatir(grille).map(({ element }) => element.id));
  return frequentsDe(reglages).masques.filter((id) => !ids.has(id));
}
