/**
 * Export file (V2.10): the user's data in one JSON file, readable by any version that knows
 * its schema. Pure: the download is done by the interface.
 */
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
 *           sauvegardes?: object[] }} options
 */
export function creerExport(etat, { version, plateforme, maintenant = Date.now(), sauvegardes }) {
  const resultat = {
    format: FORMAT_EXPORT,
    versionFormat: VERSION_FORMAT,
    versionSchema: etat.versionSchema,
    exporteLe: new Date(maintenant).toISOString(),
    application: { version, plateforme },
    grille: etat.grille,
    reglages: etat.reglages,
  };
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
  return resultat;
}
