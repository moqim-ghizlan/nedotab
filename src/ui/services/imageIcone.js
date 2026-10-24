import { chargerImage } from "./icones.js";

export const TAILLE_ICONE = 96;
export const POIDS_MAX = 16 * 1024;

/** Draws an image "contained" in a 96x96 transparent canvas. */
function dessiner(img) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TAILLE_ICONE;
  const ctx = canvas.getContext("2d");
  const l = img.naturalWidth || img.width || TAILLE_ICONE;
  const h = img.naturalHeight || img.height || TAILLE_ICONE;
  const echelle = Math.min(TAILLE_ICONE / l, TAILLE_ICONE / h);
  const lw = l * echelle;
  const lh = h * echelle;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (TAILLE_ICONE - lw) / 2, (TAILLE_ICONE - lh) / 2, lw, lh);
  return canvas;
}

/** Byte size of the payload of a base64 data URL. */
export function poidsDataUrl(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return (
    Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
  );
}

/**
 * Turns an imported file into a small raster icon (WebP 0.8, PNG fallback).
 * SVG files are rasterised too: a raw SVG is never stored (it may contain scripts).
 * @returns {Promise<{ ok: true, dataUrl: string, poids: number } | { ok: false, erreur: string }>}
 */
export async function importerImage(fichier) {
  const types = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!types.includes(fichier.type)) {
    return { ok: false, erreur: "Format non pris en charge (PNG, JPEG, WebP ou SVG)." };
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = await chargerImage(url, { delai: 8000 });
    if (!img) return { ok: false, erreur: "Cette image ne peut pas être lue." };
    const canvas = dessiner(img);
    let dataUrl = canvas.toDataURL("image/webp", 0.8);
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/png");
    const poids = poidsDataUrl(dataUrl);
    if (poids > POIDS_MAX) {
      return { ok: false, erreur: "Image trop détaillée, essayez une image plus simple." };
    }
    return { ok: true, dataUrl, poids };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Checks an icon given by URL: http(s), loads, at least 32 px (or SVG). */
export async function verifierUrlImage(saisie) {
  let url;
  try {
    url = new URL(String(saisie).trim());
  } catch {
    return { ok: false, erreur: "Cette adresse n'est pas valide." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, erreur: "Seules les adresses http et https sont acceptées." };
  }
  const img = await chargerImage(url.href, { delai: 6000 });
  if (!img) return { ok: false, erreur: "L'image ne se charge pas." };
  const svg = /\.svg(\?|#|$)/i.test(url.pathname);
  if (!svg && img.naturalWidth < 32) {
    return { ok: false, erreur: "Image trop petite (32 pixels minimum)." };
  }
  return { ok: true, url: url.href };
}

/** Number of graphemes (an emoji with modifiers counts as one). */
export function compterGraphemes(texte) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(texte)].length;
  }
  return [...texte].length;
}
