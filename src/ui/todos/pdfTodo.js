import { nomFichierSain } from "../../core/exportTodoMd.js";
import { MARGE, creerPdf, decouperLignes, textePdf } from "../../core/pdf.js";
import { enregistrerFichier } from "../copierImage.js";

const LARGEUR_TEXTE = 595.28 - 2 * MARGE;
const COTE_MAX = 1600;

const quand = (ms) =>
  ms == null ? "" : new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The sheet of a todo as lines (title, details, description). Pure but for the measure given. */
export function lignesFiche({ todo, sujet = "", imageIndisponible = false }, mesurer) {
  const coupe = (texte, taille, gras) => decouperLignes(textePdf(texte), LARGEUR_TEXTE, (t) => mesurer(t, taille, gras));
  const titre = String(todo.titre ?? "").replace(/\s+/g, " ").trim() || "Sans titre";
  const lignes = coupe(titre, 20, true).map((texte, i, tout) => ({ texte, taille: 20, gras: true, apres: i === tout.length - 1 ? 4 : 0 }));
  const infos = [sujet && `Sujet : ${sujet}`, todo.creeLe != null && `Créé ${quand(todo.creeLe)}`, todo.fait && "Fait"].filter(Boolean).join("  -  ");
  if (infos) lignes.push(...coupe(infos, 10, false).map((texte) => ({ texte, taille: 10, gris: 0.35 })), { texte: "", taille: 10, apres: 8 });
  if (todo.description?.trim()) lignes.push(...coupe(todo.description, 12, false).map((texte) => ({ texte, taille: 12 })), { texte: "", taille: 12, apres: 6 });
  if (imageIndisponible) lignes.push({ texte: textePdf("Image indisponible au moment de l'export."), taille: 11, gris: 0.45 });
  return lignes;
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
 * sheet on a phone), with no print window. The picture is inside the file: no address, nothing
 * public, nothing sent anywhere. Read with the existing method; unreadable: the PDF says so.
 * @returns {Promise<boolean>}
 */
export async function telechargerPdfTodo({ todo, sujet = "", donnees }) {
  try {
    const image = todo.images?.[0] ?? null;
    let jpeg = null;
    let imageIndisponible = false;
    if (image) {
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("hors ligne");
        jpeg = await enJpeg(await donnees.lireImage(image.chemin));
      } catch {
        imageIndisponible = true;
      }
    }
    const lignes = lignesFiche({ todo, sujet, imageIndisponible }, mesureur());
    const pdf = creerPdf({ lignes, image: jpeg });
    return await enregistrerFichier(new Blob([pdf], { type: "application/pdf" }), `${nomFichierSain(todo.titre)}.pdf`);
  } catch {
    return false;
  }
}
