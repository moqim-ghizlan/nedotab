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
      if (typeof fond.ref !== "string" || !fond.ref.startsWith("local:")) return null;
      if (!Number.isFinite(Number(fond.voile ?? 0)) || !Number.isFinite(Number(fond.flou ?? 0))) {
        return null;
      }
      return {
        type: "image",
        ref: fond.ref,
        dominante: estCouleurHex(fond.dominante) ? fond.dominante.toLowerCase() : "#808080",
        voile: borner(fond.voile ?? 0.25, 0, VOILE_MAX),
        flou: Math.round(borner(fond.flou ?? 0, 0, FLOU_MAX)),
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
  return {
    ...r,
    theme: THEMES.includes(r.theme) ? r.theme : "auto",
    fond: validerFond(r.fond) ?? { type: "aucun" },
  };
}
