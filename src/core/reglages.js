/**
 * Settings: theme and background. Pure validation, shared by the reducer and the loader.
 *
 * fond: { type: "aucun" }
 *     | { type: "couleur", valeur: "#1e293b" }
 *     | { type: "degrade", valeur: "aurore" }            (name of a built-in gradient)
 *     | { type: "image", ref: "local:<id>", dominante: "#334455", voile: 0.25, flou: 0 }
 */
export const THEMES = ["auto", "clair", "sombre"];
export const NOMS_DEGRADES = [
  "aurore",
  "lagon",
  "foret",
  "crepuscule",
  "brume",
  "ardoise",
  "sable",
  "nuit",
];
export const VOILE_MAX = 0.7;
export const FLOU_MAX = 20;

const HEX = /^#[0-9a-f]{6}$/i;
export const estCouleurHex = (v) => typeof v === "string" && HEX.test(v);

const borner = (n, min, max) => Math.min(max, Math.max(min, Number(n)));

/** Account backgrounds library (V2.6): at most 10 pictures in Storage. */
export const FONDS_MAX = 10;
export const TAILLE_FOND_MAX = 5 * 1024 * 1024;
const ID_FOND = /^[A-Za-z0-9_-]{1,64}$/;

/** A library entry: { id, chemin, dominante, largeur, hauteur, taille, ajouteLe }, or null. */
export function validerEntreeFond(e) {
  if (!e || typeof e !== "object" || typeof e.id !== "string" || !ID_FOND.test(e.id)) return null;
  if (typeof e.chemin !== "string" || !/^users\/[^/]+\/fonds\/[^/]+$/.test(e.chemin)) return null;
  const entier = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    id: e.id,
    chemin: e.chemin,
    dominante: estCouleurHex(e.dominante) ? e.dominante.toLowerCase() : "#808080",
    largeur: entier(e.largeur),
    hauteur: entier(e.hauteur),
    taille: entier(e.taille),
    ajouteLe: entier(e.ajouteLe),
  };
}

/** Valid library: entries kept in order, duplicates and extra ones dropped. */
export function validerFonds(liste) {
  const vus = new Set();
  const resultat = [];
  for (const e of Array.isArray(liste) ? liste : []) {
    const v = validerEntreeFond(e);
    if (v && !vus.has(v.id) && resultat.length < FONDS_MAX) {
      vus.add(v.id);
      resultat.push(v);
    }
  }
  return resultat;
}

/** Cache keys of pictures that are no longer in the library (to purge). */
export function fondsAPurger(idsEnCache, reglages) {
  const garder = new Set((reglages?.fonds ?? []).map((f) => f.id));
  return idsEnCache.filter((id) => !garder.has(id));
}

/** Returns a valid background, or null when `fond` cannot be accepted. */
export function validerFond(fond) {
  if (!fond || typeof fond !== "object") return null;
  switch (fond.type) {
    case "aucun":
      return { type: "aucun" };
    case "couleur":
      return estCouleurHex(fond.valeur)
        ? { type: "couleur", valeur: fond.valeur.toLowerCase() }
        : null;
    case "degrade":
      return NOMS_DEGRADES.includes(fond.valeur) ? { type: "degrade", valeur: fond.valeur } : null;
    case "image": {
      if (!Number.isFinite(Number(fond.voile ?? 0)) || !Number.isFinite(Number(fond.flou ?? 0))) {
        return null;
      }
      const effets = {
        voile: borner(fond.voile ?? 0.25, 0, VOILE_MAX),
        flou: Math.round(borner(fond.flou ?? 0, 0, FLOU_MAX)),
      };
      // Picture of the account's library (V2.6): synced, the file is in Storage.
      if (typeof fond.id === "string" && ID_FOND.test(fond.id)) {
        return { type: "image", id: fond.id, ...effets };
      }
      // Picture of this device only (V1.9): IndexedDB, never synced.
      if (typeof fond.ref !== "string" || !fond.ref.startsWith("local:")) return null;
      return {
        type: "image",
        ref: fond.ref,
        dominante: estCouleurHex(fond.dominante) ? fond.dominante.toLowerCase() : "#808080",
        ...effets,
      };
    }
    default:
      return null;
  }
}

/**
 * Applies `changements` (whitelisted keys: theme, fond) to `reglages`.
 * Unknown keys and invalid values are refused: the same object is returned.
 */
export function modifierReglages(reglages, changements) {
  if (!changements || typeof changements !== "object") return reglages;
  const cles = Object.keys(changements);
  if (cles.length === 0 || cles.some((c) => !["theme", "fond"].includes(c))) return reglages;
  const suivant = { ...reglages };
  if ("theme" in changements) {
    if (!THEMES.includes(changements.theme)) return reglages;
    suivant.theme = changements.theme;
  }
  if ("fond" in changements) {
    const fond = validerFond(changements.fond);
    if (!fond) return reglages;
    suivant.fond = fond;
  }
  return suivant;
}

/** Settings read from storage: anything invalid falls back to the defaults. */
export function validerReglages(reglages) {
  const r = reglages && typeof reglages === "object" ? reglages : {};
  const fonds = validerFonds(r.fonds);
  let fond = validerFond(r.fond) ?? { type: "aucun" };
  // A synced picture must be in the library; a device-only picture is never synced.
  if (fond.type === "image" && (fond.ref || !fonds.some((f) => f.id === fond.id))) {
    fond = { type: "aucun" };
  }
  return { ...r, theme: THEMES.includes(r.theme) ? r.theme : "auto", fond, fonds };
}

/** Forced number of columns of the home grid on this device (null: automatic). */
export const COLONNES_MIN = 3;
export const COLONNES_MAX = 10;
const colonnesValides = (n) => Number.isInteger(n) && n >= COLONNES_MIN && n <= COLONNES_MAX;

/** Settings of this device only, never synced (V2.9). */
export const CLES_APPAREIL = ["colonnes", "debug"];

/** Device-only settings: local picture background, forced columns, debug log. */
export function validerReglagesAppareil(r) {
  const resultat = {};
  const fond = validerFond(r?.fond);
  if (fond?.type === "image" && fond.ref) resultat.fond = fond;
  if (colonnesValides(r?.colonnes)) resultat.colonnes = r.colonnes;
  if (r?.debug === true) resultat.debug = true;
  return resultat;
}

/** Applies device-only changes (colonnes: null = automatic, debug: boolean). */
function modifierAppareil(etat, changements) {
  const appareil = { ...etat.reglagesAppareil };
  if ("colonnes" in changements) {
    if (changements.colonnes == null) delete appareil.colonnes;
    else if (colonnesValides(changements.colonnes)) appareil.colonnes = changements.colonnes;
    else return etat;
  }
  if ("debug" in changements) {
    if (changements.debug) appareil.debug = true;
    else delete appareil.debug;
  }
  return JSON.stringify(appareil) === JSON.stringify(etat.reglagesAppareil ?? {})
    ? etat
    : { ...etat, reglagesAppareil: appareil };
}

/**
 * Background shown on this device: the local picture if any (it has priority), else the
 * synced one. A library picture gets its dominant colour and Storage path from the library.
 */
export function fondEffectif(etat) {
  const fond = etat.reglagesAppareil?.fond ?? etat.reglages.fond;
  if (fond?.type !== "image" || !fond.id) return fond;
  const entree = (etat.reglages.fonds ?? []).find((f) => f.id === fond.id);
  return entree
    ? { ...fond, dominante: entree.dominante, chemin: entree.chemin }
    : { type: "aucun" };
}

/**
 * REGLAGES_MODIFIER on the whole state: a picture background is device-only
 * (reglagesAppareil); any other background is synced and replaces the local picture.
 */
export function modifierReglagesEtat(etat, changements) {
  const cles = Object.keys(changements ?? {});
  if (cles.length && cles.every((c) => CLES_APPAREIL.includes(c))) {
    return modifierAppareil(etat, changements);
  }
  if (cles.some((c) => CLES_APPAREIL.includes(c))) return etat; // never mixed with synced ones
  const fond = changements?.fond;
  if (fond?.type === "image" && fond.id) {
    // A library picture is synced; it replaces a device-only picture on this device.
    if (!(etat.reglages.fonds ?? []).some((f) => f.id === fond.id)) return etat;
  } else if (fond?.type === "image") {
    const autres = { ...changements };
    delete autres.fond;
    const valide = validerFond(fond);
    if (!valide) return etat;
    const reglages = Object.keys(autres).length
      ? modifierReglages(etat.reglages, autres)
      : etat.reglages;
    if (Object.keys(autres).length && reglages === etat.reglages) return etat;
    return { ...etat, reglages, reglagesAppareil: { ...etat.reglagesAppareil, fond: valide } };
  }
  const reglages = modifierReglages(etat.reglages, changements);
  if (reglages === etat.reglages) return etat;
  const suivant = { ...etat, reglages };
  if (fond && etat.reglagesAppareil?.fond) {
    const appareil = { ...etat.reglagesAppareil };
    delete appareil.fond;
    suivant.reglagesAppareil = appareil;
  }
  return suivant;
}
