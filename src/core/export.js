/**
 * Export file (V2.10): the user's data in one JSON file, readable by any version that knows
 * its schema. Pure: the download is done by the interface.
 */
import { exporterElements } from "./espacePartage.js";

export const FORMAT_EXPORT = "nedotab-export";
export const VERSION_FORMAT = 1;

/** "nedotab-2026-10-24.json" (local date). */
export function nomFichierExport(date = new Date()) {
  const deux = (n) => String(n).padStart(2, "0");
  return `nedotab-${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}.json`;
}

/**
 * @param {object} etat current state (only the synced part is exported)
 * @param {{ version: string, plateforme: "extension"|"pwa", maintenant?: number,
 *           sauvegardes?: object[], conversations?: object[] }} options
 */
export function creerExport(
  etat,
  { version, plateforme, maintenant = Date.now(), sauvegardes, conversations, stats, espacePartage },
) {
  const resultat = {
    format: FORMAT_EXPORT,
    versionFormat: VERSION_FORMAT,
    versionSchema: etat.versionSchema,
    exporteLe: new Date(maintenant).toISOString(),
    application: { version, plateforme },
    grille: etat.grille,
    reglages: etat.reglages,
  };
  // V4.21: usage statistics (weights, counts, last visit in ms), counters only.
  if (stats) resultat.stats = stats;
  // V4.24: texts and links of the sharing space (account only). Backups never include it.
  if (espacePartage) resultat.espacePartage = exporterElements(espacePartage);
  if (sauvegardes) {
    resultat.sauvegardes = sauvegardes.map((s) => ({
      id: s.id,
      creeLe: s.creeLe ?? null,
      type: s.type,
      nom: s.nom ?? null,
      nbSites: s.nbSites ?? 0,
      nbDossiers: s.nbDossiers ?? 0,
      grille: s.grille,
      reglages: s.reglages,
    }));
  }
  // V4.15: conversations with the assistant (account only). The import does not read them back.
  if (conversations) {
    resultat.conversations = conversations.map((c) => ({
      id: c.id,
      titre: c.titre,
      creeLe: c.creeLe ?? null,
      majLe: c.majLe ?? null,
      messages: (c.messages ?? []).map((m) => ({
        role: m.role,
        texte: m.texte,
        creeLe: m.creeLe ?? null,
        etat: m.etat ?? "ok",
        ...(m.origine ? { origine: m.origine } : {}),
      })),
    }));
  }
  return resultat;
}
