import { nomFichierSain } from "../../core/exportTodoMd.js";
import { creerPdfTodo } from "../../core/pdfMiseEnPage.js";
import { imageDePiste } from "../../core/pistes.js";
import { enregistrerFichier } from "../copierImage.js";

const COTE_MAX = 1600;

const quand = (ms) =>
  ms == null ? "" : new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The document the page layout draws (core/pdfMiseEnPage.js): header details and one entry per
 * piste. `images`: JPEGs by piste id; `indisponibles`: ids of the pistes whose picture could not
 * be read. Pure.
 */
export function documentTodo({ todo, sujet = "", images = {}, indisponibles = [], maintenant = Date.now() }) {
  const modifie = todo.modifieLe != null && todo.creeLe != null && Math.abs(todo.modifieLe - todo.creeLe) > 60_000;
  return {
    titre: todo.titre,
    sujet,
    infos: [
      todo.creeLe != null && `Créé le ${quand(todo.creeLe)}`,
      modifie && `Modifié le ${quand(todo.modifieLe)}`,
      todo.echeance && `Échéance : ${todo.echeance}`,
      todo.fait && "Fait",
    ],
    date: new Date(maintenant).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    pistes: (todo.pistes ?? []).map((p) => ({
      titre: p.titre,
      description: p.description,
      image: images[p.id] ?? null,
      imageIndisponible: indisponibles.includes(p.id),
    })),
  };
}

/** Width of a text in points, measured with the font the PDF uses (Helvetica = Arial's widths). */
function mesureur() {
  const ctx = document.createElement("canvas").getContext("2d");
  return (texte, taille, gras) => {
    ctx.font = `${gras ? "bold " : ""}${taille}px Helvetica, Arial, sans-serif`;
    return ctx.measureText(texte).width;
  };
}

/** The picture as a JPEG (white behind transparency), reduced to 1600 px: the PDF stays light. */
async function enJpeg(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
    const largeur = Math.max(1, Math.round(bitmap.width * echelle));
    const hauteur = Math.max(1, Math.round(bitmap.height * echelle));
    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!jpeg) throw new Error("conversion");
    return { octets: new Uint8Array(await jpeg.arrayBuffer()), largeur, hauteur };
  } finally {
    bitmap.close?.();
  }
}

/**
 * "Télécharger (.pdf)": the PDF of ONE todo is written on the device and downloaded at once (share
 * sheet on a phone), with no print window. The pictures are inside the file: no address, nothing
 * public, nothing sent anywhere. Read with the existing method; an unreadable picture: the PDF says
 * so under its piste.
 * @returns {Promise<boolean>}
 */
export async function telechargerPdfTodo({ todo, sujet = "", donnees }) {
  try {
    const images = {};
    const indisponibles = [];
    for (const piste of todo.pistes ?? []) {
      const image = imageDePiste(todo, piste);
      if (!image) continue;
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("hors ligne");
        images[piste.id] = await enJpeg(await donnees.lireImage(image.chemin));
      } catch {
        indisponibles.push(piste.id);
      }
    }
    const pdf = creerPdfTodo(documentTodo({ todo, sujet, images, indisponibles }), mesureur());
    return await enregistrerFichier(new Blob([pdf], { type: "application/pdf" }), `${nomFichierSain(todo.titre)}.pdf`);
  } catch {
    return false;
  }
}
