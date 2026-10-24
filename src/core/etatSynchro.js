/**
 * What the sync badge shows (V2.5). Being offline is a normal situation, never an error.
 * - error → "erreur";
 * - browser offline, or data only from the cache (captive portal, reconnecting) → "hors-ligne";
 * - writes not yet confirmed by the server → "attente";
 * - otherwise → "synchronise".
 */
export function etatIndicateur({ enLigne, depuisCache, enAttente, erreur = false }) {
  if (erreur) return "erreur";
  if (!enLigne || depuisCache) return "hors-ligne";
  if (enAttente) return "attente";
  return "synchronise";
}
