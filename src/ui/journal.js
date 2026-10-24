/**
 * Debug log in the console: on in development, and on a device where the user turned on
 * "Journal de débogage" (device-only setting, V2.9). Never sent anywhere.
 */
let actif = import.meta.env.DEV;

export function activerJournal(oui) {
  actif = import.meta.env.DEV || !!oui;
}

/** @returns {(...valeurs) => void} a logger prefixed with `zone` and the time. */
export function journal(zone) {
  return (...valeurs) =>
    actif && console.debug(`[${zone} ${new Date().toISOString()}]`, ...valeurs);
}
