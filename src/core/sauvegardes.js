/** Backups (V2.7): pure rules. */
export const AUTO_MAX = 30;
export const AVANT_RESTAURATION_MAX = 10;
export const MANUELLES_MAX = 50;
export const NOM_MAX = 60;
export const JOUR_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_MS = 60 * 60 * 1000;

const p = (n, l = 2) => String(n).padStart(l, "0");

/** "AAAA-MM-JJ_HHmmss_xxxx": natural chronological order, no collision. */
export function idSauvegarde(date = new Date(), alea = Math.random) {
  const lettres = "abcdefghijklmnopqrstuvwxyz0123456789";
  const suffixe = Array.from(
    { length: 4 },
    () => lettres[Math.floor(alea() * lettres.length)],
  ).join("");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}_${suffixe}`;
}

/** Manual backup name: trimmed, 1 to 60 characters, or null. */
export function nettoyerNom(nom) {
  const t = String(nom ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t ? [...t].slice(0, NOM_MAX).join("") : null;
}

/**
 * Should an automatic backup be made now? Not for an empty grid, not twice within 24 h,
 * not when the grid is identical to the last automatic backup.
 */
export function doitSauvegarder({
  etat,
  derniereAuto,
  empreinteDerniere,
  empreinteActuelle,
  maintenant = Date.now(),
}) {
  if (!etat?.grille?.length) return false;
  if (derniereAuto != null && maintenant - derniereAuto < JOUR_MS) return false;
  if (empreinteDerniere && empreinteDerniere === empreinteActuelle) return false;
  return true;
}

/**
 * Ids to delete so that at most `max` backups of `type` remain (the most recent are kept).
 * Other types are never touched. `liste`: [{ id, type, creeLe (ms) }].
 */
export function aSupprimer(liste, max = AUTO_MAX, type = "auto") {
  return liste
    .filter((s) => s.type === type)
    .sort((a, b) => (b.creeLe ?? 0) - (a.creeLe ?? 0) || (a.id < b.id ? 1 : -1))
    .slice(max)
    .map((s) => s.id);
}

/** "21/10/2026 14:35" in the user's local time. */
export function dateHeure(ms) {
  const d = new Date(ms);
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
