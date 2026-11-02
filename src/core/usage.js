/**
 * Usage score of the sites (V4.21). Pure: no DOM, no network.
 *
 * Each visit adds a weight `2 ^ (days since the epoch / half-life)` to a stored sum (atomic
 * increments: two devices never overwrite each other). The current score of a site is that
 * sum divided by `2 ^ (days now / half-life)`: exactly a counter losing half of its value
 * every 30 days. The "current" score is computed, never stored.
 */
import { DEMI_VIE_JOURS, EPOQUE_USAGE } from "./constantes.js";

const MS_PAR_JOUR = 86_400_000;

/** Seuil de la fenêtre anti-doublon : deux ouvertures du même site en moins de 10 s = une. */
export const ANTI_DOUBLON_MS = 10_000;

const nombreValide = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

const enMs = (date) =>
  date instanceof Date ? date.getTime() : typeof date === "number" ? date : Number(date);

const exposant = (date) => (enMs(date) - EPOQUE_USAGE) / MS_PAR_JOUR / DEMI_VIE_JOURS;

/** Weight a visit made at `date` adds to the stored sum. */
export function poidsVisite(date) {
  const e = exposant(date);
  return Number.isFinite(e) ? 2 ** e : 0;
}

/** Current score of a stored weight sum (0 for an aberrant value). */
export function scoreActuel(poids, maintenant = Date.now()) {
  if (!nombreValide(poids)) return 0;
  const e = exposant(maintenant);
  const score = poids / 2 ** e;
  return Number.isFinite(score) ? score : 0;
}

/** Statistics shape: three maps (weights, raw counts, last visit in ms). */
export const statsVides = () => ({ poids: {}, compte: {}, derniere: {} });

const carte = (c) => (c && typeof c === "object" && !Array.isArray(c) ? c : {});

/** Last-visit value (Timestamp, Date, number) in ms, or 0. */
function enMillis(v) {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  const n = enMs(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Reads a stored document: aberrant values (NaN, negative, Infinity) are ignored. */
export function normaliserStats(brut) {
  const stats = statsVides();
  const poids = carte(brut?.poids);
  const compte = carte(brut?.compte);
  const derniere = carte(brut?.derniere);
  for (const id of Object.keys(poids)) {
    if (!nombreValide(poids[id])) continue;
    stats.poids[id] = poids[id];
    stats.compte[id] = nombreValide(compte[id]) ? Math.round(compte[id]) : 0;
    const d = enMillis(derniere[id]);
    if (d) stats.derniere[id] = d;
  }
  return stats;
}

/** Sum of two statistics (addition is commutative: order does not matter). */
export function fusionnerVisites(a, b) {
  const x = normaliserStats(a);
  const y = normaliserStats(b);
  const r = statsVides();
  for (const id of new Set([...Object.keys(x.poids), ...Object.keys(y.poids)])) {
    r.poids[id] = (x.poids[id] ?? 0) + (y.poids[id] ?? 0);
    r.compte[id] = (x.compte[id] ?? 0) + (y.compte[id] ?? 0);
    const d = Math.max(x.derniere[id] ?? 0, y.derniere[id] ?? 0);
    if (d) r.derniere[id] = d;
  }
  return r;
}

/** A batch of visits ({ id, quand }[]) as statistics to add. */
export function statsDeVisites(visites) {
  const s = statsVides();
  for (const { id, quand } of visites) {
    const p = poidsVisite(quand);
    if (typeof id !== "string" || !id || !nombreValide(p)) continue;
    s.poids[id] = (s.poids[id] ?? 0) + p;
    s.compte[id] = (s.compte[id] ?? 0) + 1;
    s.derniere[id] = Math.max(s.derniere[id] ?? 0, enMs(quand));
  }
  return s;
}

/**
 * Brings every weight back to a recent epoch: divides them all by the same factor (the
 * ranking is unchanged). Only for the day the weights get too big; the constants of
 * constantes.js stay the same, so the caller must also shift its epoch by `jours`.
 */
export function renormaliser(stats, jours) {
  const facteur = 2 ** (jours / DEMI_VIE_JOURS);
  const r = normaliserStats(stats);
  for (const id of Object.keys(r.poids)) r.poids[id] /= facteur;
  return r;
}

/** Ids of all the sites of a grid (all levels) with their epingle flag. */
function sitesDe(grille, sortie = []) {
  for (const e of grille ?? []) {
    if (e?.type === "dossier") sitesDe(e.items, sortie);
    else if (e?.type === "site") sortie.push(e);
  }
  return sortie;
}

const collateur = new Intl.Collator("fr");

/**
 * Existing sites by decreasing current score; ties: most recent last visit, then title.
 * Entries of sites that no longer exist are ignored.
 * @returns {{ site: object, score: number, derniere: number, compte: number }[]}
 */
export function classementUsage(stats, grille, maintenant = Date.now()) {
  const s = normaliserStats(stats);
  return sitesDe(grille)
    .map((site) => ({
      site,
      score: scoreActuel(s.poids[site.id], maintenant),
      derniere: s.derniere[site.id] ?? 0,
      compte: s.compte[site.id] ?? 0,
    }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.derniere - a.derniere || collateur.compare(a.site.titre, b.site.titre),
    );
}

/** Usage level for the smart search column. */
export function niveauUsage(score) {
  if (!(score > 0)) return "jamais";
  if (score >= 3) return "fort";
  if (score >= 1) return "moyen";
  return "faible";
}

/** Whether the visit of `id` at `maintenant` repeats one made less than 10 s ago. */
export function estDoublon(dernieres, id, maintenant) {
  const avant = dernieres.get(id);
  return avant != null && maintenant - avant < ANTI_DOUBLON_MS;
}

/** Ids of the entries whose site no longer exists in the grid. */
export function entreesOrphelines(stats, grille) {
  const ids = new Set(sitesDe(grille).map((s) => s.id));
  return Object.keys(carte(stats?.poids)).filter((id) => !ids.has(id));
}
