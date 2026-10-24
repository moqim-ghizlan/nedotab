/** Background picture preparation: resize, re-encode, dominant colour. */

export const TAILLE_MAX_FICHIER = 25 * 1024 * 1024;
export const COTE_MAX = 2560;

/** Size that keeps the ratio with the longest side at most `max`. */
export function dimensionsReduites(largeur, hauteur, max = COTE_MAX) {
  const echelle = Math.min(1, max / Math.max(largeur, hauteur));
  return { largeur: Math.round(largeur * echelle), hauteur: Math.round(hauteur * echelle) };
}

function versBlob(canvas, type, qualite) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality: qualite });
  return new Promise((resolve) => canvas.toBlob(resolve, type, qualite));
}

function creerCanvas(l, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(l, h);
  const c = document.createElement("canvas");
  c.width = l;
  c.height = h;
  return c;
}

/** Average colour of the picture reduced to 32 x 32. */
function dominante(source) {
  const c = creerCanvas(32, 32);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  const s = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    s[0] += d[i];
    s[1] += d[i + 1];
    s[2] += d[i + 2];
  }
  const n = d.length / 4;
  return `#${s
    .map((v) =>
      Math.round(v / n)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * @returns {Promise<{ ok: true, blob: Blob, dominante: string, largeur: number, hauteur: number }
 *                  | { ok: false, erreur: string }>}
 */
export async function preparerImageFond(fichier) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(fichier.type)) {
    return { ok: false, erreur: "Format non pris en charge (JPEG, PNG ou WebP)." };
  }
  if (fichier.size > TAILLE_MAX_FICHIER) {
    return { ok: false, erreur: "Image trop lourde (25 Mo au plus)." };
  }
  let bitmap;
  try {
    // Phone photos carry their orientation in EXIF: put them upright.
    bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, erreur: "Cette image ne peut pas être lue." };
  }
  const { largeur, hauteur } = dimensionsReduites(bitmap.width, bitmap.height);
  const canvas = creerCanvas(largeur, hauteur);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  const couleur = dominante(bitmap);
  bitmap.close?.();
  let blob = await versBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/jpeg", 0.85);
  if (!blob) return { ok: false, erreur: "Cette image ne peut pas être convertie." };
  return { ok: true, blob, dominante: couleur, largeur, hauteur };
}
