/**
 * Custom icon of a folder (T11). Pure. Same shapes as the icon of a site (letter, image from
 * an address, imported image) plus built-in glyphs stored by identifier: { type: "glyphe",
 * id, couleur }. Nothing heavy ever goes into the grid: an imported image is at most 16 KB.
 */
export const POIDS_ICONE_MAX = 16 * 1024;

/** Built-in glyphs (drawn as local SVG by the UI). */
export const GLYPHES = [
  "dossier",
  "etoile",
  "coeur",
  "travail",
  "maison",
  "jeux",
  "musique",
  "etudes",
  "achats",
  "ia",
  "outils",
  "video",
];

const COULEUR = /^#[0-9a-fA-F]{3,8}$/;
const poidsBase64 = (dataUrl) => {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((b64.length * 3) / 4);
};

/** @returns {object|null} the cleaned icon, or null when it is not valid (or absent). */
export function validerIconeDossier(icone) {
  if (!icone || typeof icone !== "object") return null;
  const couleur = typeof icone.couleur === "string" && COULEUR.test(icone.couleur) ? icone.couleur : null;
  switch (icone.type) {
    case "lettre": {
      if (!couleur) return null;
      const texte = typeof icone.texte === "string" ? [...icone.texte.trim()].slice(0, 2).join("") : "";
      return texte ? { type: "lettre", couleur, texte } : { type: "lettre", couleur };
    }
    case "glyphe":
      return couleur && GLYPHES.includes(icone.id) ? { type: "glyphe", id: icone.id, couleur } : null;
    case "url":
      return typeof icone.valeur === "string" && /^https:\/\//i.test(icone.valeur) && icone.valeur.length <= 2000
        ? { type: "url", valeur: icone.valeur, source: "perso" }
        : null;
    case "image":
      return typeof icone.valeur === "string" &&
        /^data:image\/(png|jpeg|webp);base64,/i.test(icone.valeur) &&
        poidsBase64(icone.valeur) <= POIDS_ICONE_MAX
        ? { type: "image", valeur: icone.valeur }
        : null;
    default:
      return null;
  }
}
