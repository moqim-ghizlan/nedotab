/**
 * Due dates (V6.2, completed in V6.5). A due date is a DAY of the calendar, 'AAAA-MM-JJ': it is
 * never converted through UTC. All the arithmetic goes through the year / month / day numbers
 * (UTC dates are used only as a calendar, never to read the time of the user), so a change of
 * summer time, a negative time zone or a 29 February cannot shift a day.
 *
 * Pure: the clock is always a parameter (`maintenant`, a Date), never read here.
 */
import { echeanceValide } from "./todos.js";

const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

const deux = (n) => String(n).padStart(2, "0");

/** The calendar day of a date in the user's own time zone: 'AAAA-MM-JJ' (local components). */
export const jourLocal = (date = new Date()) =>
  `${String(date.getFullYear()).padStart(4, "0")}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;

/** Compares two days as texts: negative, 0 or positive. Invalid values sort last. */
export function compareJours(a, b) {
  const va = echeanceValide(a);
  const vb = echeanceValide(b);
  if (!va || !vb) return va === vb ? 0 : va ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

const enJours = (jour) => {
  const [a, m, j] = jour.split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, j) / 86_400_000);
};
const depuisJours = (n) => {
  const d = new Date(n * 86_400_000);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
};

/** The day `n` days after (or before, if negative) a day. */
export const ajouterJours = (jour, n) => depuisJours(enJours(jour) + n);

/** Whole days from `a` to `b` (positive when `b` is later). */
export const joursEntre = (a, b) => enJours(b) - enJours(a);

/** Day of the week, Monday = 0 … Sunday = 6. */
const jourDeSemaine = (jour) => (((enJours(jour) + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday

/**
 * Monday and Sunday of the week of a day (weeks start on Monday).
 * @returns {{ debut: string, fin: string }}
 */
export function bornesSemaine(jour) {
  const decalage = jourDeSemaine(jour);
  return { debut: ajouterJours(jour, -decalage), fin: ajouterJours(jour, 6 - decalage) };
}

/** The next Monday (the quick button "semaine prochaine"). */
export const lundiProchain = (jour) => ajouterJours(jour, 7 - jourDeSemaine(jour));

/** "12 nov." (the year is added when it is not the current one). */
export function formaterEcheanceCourte(echeance, maintenant = new Date()) {
  if (!echeanceValide(echeance)) return "";
  const [a, m, j] = echeance.split("-").map(Number);
  const base = `${j} ${MOIS_COURTS[m - 1]}`;
  return a === maintenant.getFullYear() ? base : `${base} ${a}`;
}

/**
 * Where a due date stands relative to today.
 * @returns {"aucune"|"retard"|"aujourdhui"|"demain"|"semaine"|"plus-tard"}
 */
export function statutEcheance(echeance, maintenant = new Date()) {
  if (!echeanceValide(echeance)) return "aucune";
  const aujourdhui = jourLocal(maintenant);
  const c = compareJours(echeance, aujourdhui);
  if (c < 0) return "retard";
  if (c === 0) return "aujourdhui";
  if (echeance === ajouterJours(aujourdhui, 1)) return "demain";
  return compareJours(echeance, bornesSemaine(aujourdhui).fin) <= 0 ? "semaine" : "plus-tard";
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Text of the pill: "Aujourd'hui", "Demain", "Hier", "Dans 3 jours", "En retard de 2 jours",
 * "12 nov." beyond a week. Always words: the colour never carries the meaning alone.
 */
export function libelleEcheance(echeance, maintenant = new Date()) {
  if (!echeanceValide(echeance)) return "";
  const delta = joursEntre(jourLocal(maintenant), echeance);
  if (delta === 0) return "Aujourd'hui";
  if (delta === 1) return "Demain";
  if (delta === -1) return "Hier";
  if (delta < 0) return `En retard de ${pluriel(-delta, "jour")}`;
  if (delta <= 7) return `Dans ${delta} jours`;
  return formaterEcheanceCourte(echeance, maintenant);
}

/** Milliseconds until the next local midnight (the display is recomputed then). */
export function msAvantMinuit(maintenant = new Date()) {
  const minuit = new Date(maintenant);
  minuit.setHours(24, 0, 0, 0);
  return Math.max(1000, minuit.getTime() - maintenant.getTime());
}

/** The groups of the "Aujourd'hui" view, in order. */
export const GROUPES_AUJOURDHUI = [
  { id: "retard", libelle: "En retard" },
  { id: "aujourdhui", libelle: "Aujourd'hui" },
  { id: "demain", libelle: "Demain" },
  { id: "semaine", libelle: "Cette semaine" },
];

/**
 * Splits the todos still to do into the groups of the view, each sorted by due date.
 * @returns {{ id: string, libelle: string, todos: object[] }[]}
 */
export function grouperAujourdhui(todos, maintenant = new Date()) {
  const groupes = GROUPES_AUJOURDHUI.map((g) => ({ ...g, todos: [] }));
  for (const t of todos) {
    if (t.fait) continue;
    const g = groupes.find((x) => x.id === statutEcheance(t.echeance, maintenant));
    g?.todos.push(t);
  }
  for (const g of groupes)
    g.todos.sort((a, b) => compareJours(a.echeance, b.echeance) || (a.ordre ?? 0) - (b.ordre ?? 0));
  return groupes;
}

/** Number of todos still to do whose due date is before today. */
export const compterEnRetard = (todos, maintenant = new Date()) =>
  todos.filter((t) => !t.fait && statutEcheance(t.echeance, maintenant) === "retard").length;
