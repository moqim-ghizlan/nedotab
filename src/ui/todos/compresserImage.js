import { COTE_MAX, COTE_MINI, dimensionsCible, extensionPour } from "../../core/imagesTodo.js";

/** Error shown to the user when a file cannot be read as a picture. */
export class ErreurImage extends Error {
  constructor(message, code = "illisible") {
    super(message);
    this.code = code;
  }
}

/** Draws the bitmap at the target size and encodes it: WebP when the browser can, JPEG otherwise. */
async function encoder(source, largeur, hauteur, qualite, creerCanvas) {
  const dessiner = (fond) => {
    const canvas = creerCanvas(largeur, hauteur);
    const ctx = canvas.getContext("2d");
    // A transparent PNG would turn black in JPEG: a white background first, JPEG only.
    if (fond) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, largeur, hauteur);
    }
    ctx.drawImage(source, 0, 0, largeur, hauteur);
    return canvas;
  };
  const versBlob = (canvas, type, q) =>
    new Promise((ok) => (canvas.toBlob ? canvas.toBlob((b) => ok(b), type, q) : canvas.convertToBlob({ type, quality: q }).then(ok)));
  // The real capacity is tested: Safari may answer with a PNG when WebP is asked.
  const webp = await versBlob(dessiner(false), "image/webp", qualite);
  if (webp && webp.type === "image/webp") return { blob: webp, typeMime: "image/webp" };
  const jpeg = await versBlob(dessiner(true), "image/jpeg", Math.min(0.9, qualite + 0.05));
  if (!jpeg) throw new ErreurImage("L'image n'a pas pu être réduite.", "encodage");
  return { blob: jpeg, typeMime: "image/jpeg" };
}

/**
 * Makes a picture ready to send (V6.4): decoded for real (a file that is not a picture is
 * refused here), turned the right way (the EXIF orientation is applied BEFORE the metadata goes),
 * reduced to 1 920 px, and redrawn on a canvas then encoded again, which drops every EXIF block
 * (GPS position included). A thumbnail of 240 px is made at the same time.
 *
 * @param {Blob} fichier
 * @param {{ creerBitmap?: typeof createImageBitmap, creerCanvas?: (l: number, h: number) => HTMLCanvasElement }} [d]
 * @returns {Promise<{ blob: Blob, mini: Blob, ext: string, typeMime: string, largeur: number, hauteur: number }>}
 */
export async function preparerImage(
  fichier,
  {
    creerBitmap = (f, o) => globalThis.createImageBitmap(f, o),
    creerCanvas = (l, h) => Object.assign(document.createElement("canvas"), { width: l, height: h }),
  } = {},
) {
  let bitmap;
  try {
    bitmap = await creerBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    throw new ErreurImage(
      "Cette image ne peut pas être lue. Choisissez une photo JPEG, PNG ou WebP.",
      "illisible",
    );
  }
  try {
    const { largeur, hauteur } = dimensionsCible(bitmap.width, bitmap.height, COTE_MAX);
    const principale = await encoder(bitmap, largeur, hauteur, 0.82, creerCanvas);
    const petite = dimensionsCible(bitmap.width, bitmap.height, COTE_MINI);
    const mini = await encoder(bitmap, petite.largeur, petite.hauteur, 0.7, creerCanvas);
    return {
      blob: principale.blob,
      // The thumbnail uses the same format as the picture (same extension in Storage).
      mini: mini.typeMime === principale.typeMime ? mini.blob : principale.blob,
      ext: extensionPour(principale.typeMime),
      typeMime: principale.typeMime,
      largeur,
      hauteur,
    };
  } finally {
    bitmap.close?.();
  }
}
