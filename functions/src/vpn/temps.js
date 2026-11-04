/**
 * V5.9: days and months of the VPN usage, always in Europe/Paris (one clock for the day change,
 * the month change and the monthly reset). Pure.
 */
const FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** @returns {{ mois: string, jour: string }} e.g. { mois: "2026-11", jour: "05" } */
export function jourParis(ms) {
  const p = Object.fromEntries(FORMAT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { mois: `${p.year}-${p.month}`, jour: p.day };
}

/** Number of days left in the month of `ms` (today included). */
export function joursRestants(ms) {
  const { mois, jour } = jourParis(ms);
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate() - Number(jour) + 1;
}

/** "2026-11" minus `n` months → "2025-11". */
export function moisAvant(mois, n) {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const GO = 1_000_000_000;
