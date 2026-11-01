/**
 * Results of the availability checks (V4.17), pure. A site is never called dead on one
 * answer: "introuvable" or "injoignable" must be seen twice, at least 10 minutes apart,
 * before a deletion is even proposed. Other statuses (blocked, server error, redirected) never
 * lead to a deletion. The results are kept 7 days on the device (not synced).
 */
export const DELAI_REVERIFICATION_MS = 10 * 60 * 1000;
export const VALIDITE_MS = 7 * 24 * 3600 * 1000;
export const STATUTS_A_CONFIRMER = ["introuvable", "injoignable"];
export const LIBELLES_STATUTS = {
  ok: "Répond normalement",
  redirige: "Adresse déplacée",
  introuvable: "Page introuvable (404)",
  "erreur-serveur": "Erreur du site (5xx)",
  injoignable: "Injoignable",
  bloque: "Accès refusé ou limité : rien à conclure",
  "non-verifiable": "Non vérifiable (adresse privée ou sensible)",
};

/** "312 sites, environ 1 minute" (5 at a time, about 1 s each). */
export function estimation(n) {
  const secondes = Math.ceil(n / 5) * 1.5;
  const duree = secondes < 90 ? `${Math.max(1, Math.round(secondes))} s` : `${Math.round(secondes / 60)} min`;
  return `${n} site${n > 1 ? "s" : ""}, environ ${duree}`;
}

/**
 * @param {Record<string, object>} anciens results kept from earlier checks
 * @param {{ id: string, statut: string, code?: number, urlFinale?: string }[]} resultats
 * @returns {Record<string, object>} anciens + the new results, each { statut, vuLe, premierVu, confirme }
 */
export function fusionnerVerifications(anciens, resultats, maintenant) {
  const sortie = { ...anciens };
  for (const r of resultats) {
    const avant = anciens[r.id];
    const suspect = STATUTS_A_CONFIRMER.includes(r.statut);
    const memeAvant = suspect && avant?.statut === r.statut;
    const premierVu = memeAvant ? avant.premierVu : maintenant;
    sortie[r.id] = {
      statut: r.statut,
      ...(r.code ? { code: r.code } : {}),
      ...(r.urlFinale && r.statut === "redirige" ? { urlFinale: r.urlFinale } : {}),
      vuLe: maintenant,
      premierVu,
      confirme: suspect && memeAvant && maintenant - premierVu >= DELAI_REVERIFICATION_MS,
    };
  }
  return sortie;
}

/** Results older than 7 days, or of sites that no longer exist, are forgotten. */
export function purger(verifications, idsExistants, maintenant) {
  return Object.fromEntries(
    Object.entries(verifications).filter(
      ([id, v]) => idsExistants.has(id) && maintenant - v.vuLe < VALIDITE_MS,
    ),
  );
}

/** A deletion may be proposed only for a status seen twice. */
export const peutProposerSuppression = (v) =>
  !!v && v.confirme === true && STATUTS_A_CONFIRMER.includes(v.statut);

/** Suspect, not yet confirmed, and the waiting time is over: it can be checked again. */
export const peutRevérifier = (v, maintenant) =>
  !!v &&
  STATUTS_A_CONFIRMER.includes(v.statut) &&
  !v.confirme &&
  maintenant - v.premierVu >= DELAI_REVERIFICATION_MS;

/** Suspect and waiting: how many ms before the second check makes sense. */
export const attenteRestante = (v, maintenant) =>
  Math.max(0, DELAI_REVERIFICATION_MS - (maintenant - v.premierVu));
