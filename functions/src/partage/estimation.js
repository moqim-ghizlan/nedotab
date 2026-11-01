// Copy of src/core/estimation.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Cost estimates and personal limits of the AI (V4.19). Pure; shared by the browser (screen,
 * tests) and the server (functions/src/partage/, identical copy).
 *
 * Prices are never in the code: config/ia.prix holds, for "<provider>:<model>", the price per
 * million tokens and its currency; config/ia.tauxChange the fixed rate to euros. Everything shown
 * is an ESTIMATE: the amount really billed is the provider's.
 */

export const DEVISE_AFFICHAGE = "EUR";
/** Alert thresholds on a limit: a quiet notice at 80 %, the AI stops at 100 %. */
export const SEUIL_ALERTE = 0.8;

const nombre = (v) => (Number.isFinite(v) && v >= 0 ? v : null);

/**
 * The price of a model: the one the user typed for it (custom model) or the one of config/ia.
 * @returns {{ entreeParMillion: number, sortieParMillion: number, devise: string }|null}
 */
export function prixDe(prix, fournisseur, modele, prixPerso = {}) {
  const cle = `${fournisseur}:${modele}`;
  const p = prixPerso?.[cle] ?? prix?.[cle];
  if (!p) return null;
  const e = nombre(p.entreeParMillion);
  const s = nombre(p.sortieParMillion);
  if (e === null || s === null) return null;
  return { entreeParMillion: e, sortieParMillion: s, devise: String(p.devise || "EUR") };
}

/**
 * Cost of a call in euros, or null when the price is unknown ("prix inconnu": tokens only).
 * @param {{ entree?: number, sortie?: number }} jetons
 */
export function coutEstime(jetons, prix, tauxChange = {}) {
  if (!prix) return null;
  const taux = prix.devise === "EUR" ? 1 : nombre(tauxChange?.[prix.devise]);
  if (taux === null) return null;
  const e = Math.max(0, jetons?.entree ?? 0);
  const s = Math.max(0, jetons?.sortie ?? 0);
  const brut = (e * prix.entreeParMillion + s * prix.sortieParMillion) / 1_000_000;
  return brut * taux;
}

/** "0,0042 €" / "0,12 €" / "3,40 €": enough decimals for tiny amounts. */
export function formaterEuros(montant) {
  if (!Number.isFinite(montant)) return "prix inconnu";
  const decimales = montant === 0 ? 2 : montant < 0.01 ? 4 : 2;
  return `${montant.toFixed(decimales).replace(".", ",")} €`;
}

const entierPositif = (v, max) =>
  Number.isInteger(v) && v > 0 ? Math.min(v, max) : undefined;
const montantPositif = (v, max) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const arrondi = Math.min(Math.round(v * 10000) / 10000, max); // a tiny limit must stay a limit
  return arrondi > 0 ? arrondi : undefined;
};

/**
 * reglages.ia.limites = { jour?: { appels?, euros? }, mois?: { appels?, euros? } }, each limit
 * optional. Anything wrong is dropped; an empty object is returned as null (no limit).
 */
export function validerLimites(brut) {
  const sortie = {};
  for (const periode of ["jour", "mois"]) {
    const l = brut?.[periode];
    const appels = entierPositif(l?.appels, 100000);
    const euros = montantPositif(l?.euros, 100000);
    if (appels !== undefined || euros !== undefined) {
      sortie[periode] = {
        ...(appels !== undefined ? { appels } : {}),
        ...(euros !== undefined ? { euros } : {}),
      };
    }
  }
  return Object.keys(sortie).length ? sortie : null;
}

/**
 * Where the user stands against their personal limits.
 * @param {ReturnType<typeof validerLimites>} limites
 * @param {{ jour: { appels: number, coutEstime: number }, mois: { appels: number, coutEstime: number } }} usage
 * @returns {{ atteinte: { periode: string, type: string }|null,
 *   alertes: { periode: string, type: string, pourcent: number }[] }}
 */
export function etatLimites(limites, usage) {
  const alertes = [];
  let atteinte = null;
  for (const periode of ["jour", "mois"]) {
    for (const [type, cle] of [
      ["appels", "appels"],
      ["euros", "coutEstime"],
    ]) {
      const limite = limites?.[periode]?.[type];
      if (!limite) continue;
      const utilise = usage?.[periode]?.[cle] ?? 0;
      const ratio = utilise / limite;
      if (ratio >= 1) atteinte ??= { periode, type };
      else if (ratio >= SEUIL_ALERTE)
        alertes.push({ periode, type, pourcent: Math.floor(ratio * 100) });
    }
  }
  return { atteinte, alertes };
}

/** "04", "2026-11" helpers shared by the usage documents. */
export const moisDe = (jourParis) => jourParis.slice(0, 7);
export const jourDuMois = (jourParis) => String(Number(jourParis.slice(8, 10)));
