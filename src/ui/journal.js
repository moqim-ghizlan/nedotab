import { creerJournalInterne, texteSur } from "../core/journal.js";

/**
 * Debug log. Two parts:
 * - the console, on in development and on a device where the user turned on "Journal de
 *   débogage" (device-only setting, V2.9);
 * - the internal log (V3.10): the last 500 events, always kept in memory (never stored,
 *   never sent), read in the Diagnostic panel. Personal data is removed on the way in
 *   (core/journal.js).
 */
let actif = import.meta.env.DEV;

export const journalInterne = creerJournalInterne();

export function activerJournal(oui) {
  actif = import.meta.env.DEV || !!oui;
}

/** Log zone → category of the internal log. */
const CATEGORIE = { synchro: "sync", compte: "auth", auth: "auth", icones: "stockage" };

/** @returns {(...valeurs) => void} a logger prefixed with `zone` and the time. */
export function journal(zone) {
  const categorie = CATEGORIE[zone] ?? zone;
  return (...valeurs) => {
    journalInterne.ajouter(categorie, valeurs.map((v) => texteSur(v)).join(" "));
    if (actif) console.debug(`[${zone} ${new Date().toISOString()}]`, ...valeurs);
  };
}

/** Unhandled errors go to the internal log, also when the debug mode is off. */
export function capturerErreurs(cible = globalThis) {
  cible.addEventListener("error", (e) =>
    journalInterne.ajouter("erreur", e.error ?? e.message, { niveau: "erreur" }),
  );
  cible.addEventListener("unhandledrejection", (e) =>
    journalInterne.ajouter("erreur", e.reason ?? "promesse rejetée", { niveau: "erreur" }),
  );
}
