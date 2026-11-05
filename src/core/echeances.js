/**
 * Due dates (V6.2, completed in V6.5). A due date is a DAY of the calendar, 'AAAA-MM-JJ': it is
 * never converted through UTC. Pure: the clock is always a parameter.
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

/** "12 nov." (the year is added when it is not the current one). */
export function formaterEcheanceCourte(echeance, maintenant = new Date()) {
  if (!echeanceValide(echeance)) return "";
  const [a, m, j] = echeance.split("-").map(Number);
  const base = `${j} ${MOIS_COURTS[m - 1]}`;
  return a === maintenant.getFullYear() ? base : `${base} ${a}`;
}
