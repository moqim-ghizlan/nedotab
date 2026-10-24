/**
 * Pure rules of the functions (tested without the emulators).
 */

/** Seconds a sign-in stays "recent" for a sensitive action (account deletion). */
export const AGE_CONNEXION_MAX_S = 300;

/**
 * True when the user signed in less than `max` seconds ago (`auth_time` of the ID token,
 * in seconds). A missing or future time is refused.
 */
export function connexionRecente(authTime, maintenantMs = Date.now(), max = AGE_CONNEXION_MAX_S) {
  if (!Number.isFinite(authTime)) return false;
  const age = Math.floor(maintenantMs / 1000) - authTime;
  return age >= -60 && age <= max;
}

/** Storage errors meaning "nothing to delete" (no bucket on the free plan, no file). */
export function stockageAbsent(erreur) {
  const code = erreur?.code ?? erreur?.response?.status;
  return code === 404 || /not ?found|does not exist|no such bucket/i.test(String(erreur?.message));
}
