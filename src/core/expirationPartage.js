/**
 * Expiry of the sharing space (V4.27). Pure: no DOM, no Firebase. Identical copy in
 * functions/src/partage/expirationPartage.js (same method as listeCompacte; a test compares
 * them). An item expires after 1 h, 2 h, 1 day, 7 days or 30 days, or never ("jamais": expireLe is
 * the far-future ILLIMITE, so every comparison, rule and cleanup query keeps working unchanged).
 * All times are UTC milliseconds; the device clock is corrected by `ecart` (server − device).
 */
export const MINUTE = 60_000;
export const HEURE = 60 * MINUTE;
export const JOUR = 24 * HEURE;
/** expireLe of an item kept for ever: 9999-12-31 UTC (what the rules compare against). */
export const ILLIMITE = Date.UTC(9999, 11, 31);
export const estIllimite = (expireLe) => expireLe === ILLIMITE;

/** Allowed durations: { id, libelle, ms }. */
export const DUREES = [
  { id: "1h", libelle: "1 h", ms: HEURE },
  { id: "2h", libelle: "2 h", ms: 2 * HEURE },
  { id: "1j", libelle: "1 j", ms: JOUR },
  { id: "7j", libelle: "7 j", ms: 7 * JOUR },
  { id: "30j", libelle: "30 j", ms: 30 * JOUR },
  { id: "jamais", libelle: "Illimité", ms: null },
];
export const DUREE_DEFAUT = "1j";
/** Total life (created + extended) never goes past this: the Storage lifecycle is set to 40 days. */
export const VIE_MAX_MS = 30 * JOUR;
/** Margins used by the rules: expireLe is within [now + 55 min, now + 31 days]. */
export const BORNE_BASSE_MS = 55 * MINUTE;
export const BORNE_HAUTE_MS = 31 * JOUR;
export const ALERTE_MS = 15 * MINUTE;
export const MIGRATION_JOURS = 7;

export const dureeParId = (id) =>
  DUREES.find((d) => d.id === id) ?? DUREES.find((d) => d.id === DUREE_DEFAUT);

/** Now, according to the server: the device clock plus the measured offset. */
export const maintenantCorrige = (ecart = 0, maintenant = Date.now()) =>
  maintenant + (Number.isFinite(ecart) ? ecart : 0);

/** expireLe (ms) of a new item. */
export const calculerExpiration = (dureeId, ecart = 0, maintenant = Date.now()) =>
  dureeParId(dureeId).ms === null
    ? ILLIMITE
    : maintenantCorrige(ecart, maintenant) + dureeParId(dureeId).ms;

/** True when the item is past its expiry (an item without expireLe never expires: legacy). */
export function estExpire(element, ecart = 0, maintenant = Date.now()) {
  return (
    Number.isFinite(element?.expireLe) && element.expireLe <= maintenantCorrige(ecart, maintenant)
  );
}

/** Milliseconds left (null without expiry, 0 when over). */
export function tempsRestantMs(element, ecart = 0, maintenant = Date.now()) {
  return Number.isFinite(element?.expireLe)
    ? Math.max(0, element.expireLe - maintenantCorrige(ecart, maintenant))
    : null;
}

/** "3 j", "2 h 10", "45 min", "moins d'1 min". */
export function formaterTempsRestant(ms) {
  if (ms == null) return "";
  if (ms > 1000 * JOUR) return "illimité"; // far-future ILLIMITE
  if (ms < MINUTE) return "moins d'1 min";
  const min = Math.floor(ms / MINUTE);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${String(min % 60).padStart(2, "0")}` : `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

/** "expire dans 3 h" / "expire dans 4 min", urgent under 15 min. */
export function libelleExpiration(element, ecart = 0, maintenant = Date.now()) {
  const ms = tempsRestantMs(element, ecart, maintenant);
  if (ms === null) return { texte: "", urgent: false };
  if (estIllimite(element.expireLe)) return { texte: "illimité", urgent: false };
  return { texte: `expire dans ${formaterTempsRestant(ms)}`, urgent: ms < ALERTE_MS };
}

/**
 * Extension of an item by `dureeId`, from now (not from the old expiry), capped at 30 days
 * after its creation. @returns {{ ok: true, expireLe: number } | { ok: false, erreur: string }}
 */
export function prolonger(element, dureeId, ecart = 0, maintenant = Date.now()) {
  if (estIllimite(element.expireLe)) return { ok: false, erreur: "Déjà illimité" };
  const plafond = (element.creeLe ?? maintenantCorrige(ecart, maintenant)) + VIE_MAX_MS;
  const voulu = calculerExpiration(dureeId, ecart, maintenant);
  const nouveau = estIllimite(voulu) ? voulu : Math.min(voulu, plafond);
  if (!Number.isFinite(element.expireLe) ? false : nouveau <= element.expireLe)
    return { ok: false, erreur: "Durée maximale atteinte" };
  return { ok: true, expireLe: nouveau };
}

/**
 * New expiry chosen when an item is edited (T4). Only ever LATER than the current one (the
 * Firestore rule refuses a shorter life), never past 30 days after the creation unless
 * unlimited, and always valid for the rules.
 * choix: { mode: "garder" } | { mode: "depuis-maintenant", duree } (a fresh duration counted
 * from now) | { mode: "ajouter", duree } (the current expiry plus that duration).
 * @returns {{ ok: true, expireLe: number, change: boolean } | { ok: false, erreur: string }}
 */
export function nouvelleExpiration(element, choix, ecart = 0, maintenant = Date.now()) {
  const actuel = element?.expireLe;
  if (!choix || choix.mode === "garder") return { ok: true, expireLe: actuel, change: false };
  if (estIllimite(actuel)) return { ok: false, erreur: "Déjà illimité" };
  const maintenantServeur = maintenantCorrige(ecart, maintenant);
  const duree = DUREES.find((d) => d.id === choix.duree);
  if (!duree) return { ok: false, erreur: "Durée inconnue" };
  const plafond = (element.creeLe ?? maintenantServeur) + VIE_MAX_MS;
  let voulu;
  if (duree.ms === null) voulu = ILLIMITE;
  else if (choix.mode === "ajouter") {
    voulu = (Number.isFinite(actuel) ? actuel : maintenantServeur) + duree.ms;
  } else if (choix.mode === "depuis-maintenant") voulu = maintenantServeur + duree.ms;
  else return { ok: false, erreur: "Choix inconnu" };
  const nouveau = estIllimite(voulu) ? voulu : Math.min(voulu, plafond);
  if (Number.isFinite(actuel) && nouveau < actuel)
    return { ok: false, erreur: "Une durée plus courte ne peut pas être appliquée" };
  if (Number.isFinite(actuel) && nouveau === actuel)
    return { ok: false, erreur: "Durée maximale atteinte" };
  if (!expirationValide(nouveau, maintenantServeur)) return { ok: false, erreur: "Durée invalide" };
  return { ok: true, expireLe: nouveau, change: true };
}

/** Durations that would still extend the item (to disable the others in the mini-selector). */
export const dureesProlongeables = (element, ecart = 0, maintenant = Date.now()) =>
  DUREES.filter((d) => prolonger(element, d.id, ecart, maintenant).ok);

/** Checks what the rules check: expireLe within [now + 55 min, now + 31 days]. */
export function expirationValide(expireLe, maintenant) {
  return (
    Number.isFinite(expireLe) &&
    (estIllimite(expireLe) ||
      (expireLe >= maintenant + BORNE_BASSE_MS && expireLe <= maintenant + BORNE_HAUTE_MS))
  );
}

/** Offset (server − device) learnt when an item we wrote is confirmed by the server. */
export const ecartDepuisConfirmation = (creeLeServeur, maintenantLocal = Date.now()) =>
  Number.isFinite(creeLeServeur) ? creeLeServeur - maintenantLocal : 0;

/** Items without expiry (created before V4.27): to be migrated with the user's agreement. */
export const sansExpiration = (elements) => elements.filter((e) => !Number.isFinite(e.expireLe));
