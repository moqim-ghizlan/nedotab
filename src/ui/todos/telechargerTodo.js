import { extensionImage } from "../../core/imageSortie.js";
import { nomFichierSain, todoVersMarkdown } from "../../core/exportTodoMd.js";
import { imageDePiste } from "../../core/pistes.js";
import { creerZip } from "../../core/zip.js";
import { enregistrerFichier } from "../copierImage.js";

/**
 * Downloads ONE todo as Markdown (V7.1). With pictures: `titre.zip` holding `titre.md` and
 * `images/piste-N.<ext>` (the .md points to them with relative links, so any Markdown reader shows
 * them). Without: a simple `titre.md`. If a picture cannot be read (offline, removed), the .md is
 * still exported with a note. The picture is read with the existing method.
 * Nothing is sent anywhere: the file is built on the device.
 *
 * @returns {Promise<boolean>} false when the file could not be handed over
 */
export async function telechargerTodo({ todo, sujet = "", donnees }) {
  const base = nomFichierSain(todo.titre);
  const encodeur = new TextEncoder();
  const cheminsImages = {};
  const imagesIndisponibles = [];
  const fichiers = [];
  // 7.3: one picture per piste, `images/piste-N.<ext>`.
  for (const [i, piste] of (todo.pistes ?? []).entries()) {
    const image = imageDePiste(todo, piste);
    if (!image) continue;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("hors ligne");
      const blob = await donnees.lireImage(image.chemin);
      const chemin = `images/piste-${i + 1}.${extensionImage(blob.type || image.typeMime, image.chemin)}`;
      cheminsImages[piste.id] = chemin;
      fichiers.push({ nom: chemin, octets: new Uint8Array(await blob.arrayBuffer()) });
    } catch {
      imagesIndisponibles.push(piste.id);
    }
  }
  const md = todoVersMarkdown(todo, { sujet, cheminsImages, imagesIndisponibles });
  if (fichiers.length > 0) {
    const zip = creerZip([{ nom: `${base}.md`, octets: encodeur.encode(md) }, ...fichiers]);
    return enregistrerFichier(new Blob([zip], { type: "application/zip" }), `${base}.zip`);
  }
  return enregistrerFichier(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
}
