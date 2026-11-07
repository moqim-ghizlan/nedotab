import { extensionImage } from "../../core/imageSortie.js";
import { nomFichierSain, todoVersMarkdown } from "../../core/exportTodoMd.js";
import { creerZip } from "../../core/zip.js";
import { enregistrerFichier } from "../copierImage.js";

/**
 * Downloads ONE todo as Markdown (V7.1). With a picture: `titre.zip` holding `titre.md` and
 * `images/image.<ext>` (the .md points to it with a relative link, so any Markdown reader shows
 * it). Without: a simple `titre.md`. If the picture cannot be read (offline, removed), the .md is
 * still exported with a note. The picture is read with the existing method.
 * Nothing is sent anywhere: the file is built on the device.
 *
 * @returns {Promise<boolean>} false when the file could not be handed over
 */
export async function telechargerTodo({ todo, sujet = "", donnees }) {
  const image = todo.images?.[0] ?? null;
  let blob = null;
  let indisponible = false;
  if (image) {
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("hors ligne");
      blob = await donnees.lireImage(image.chemin);
    } catch {
      indisponible = true;
    }
  }
  const base = nomFichierSain(todo.titre);
  const encodeur = new TextEncoder();
  if (blob) {
    const chemin = `images/image.${extensionImage(blob.type || image.typeMime, image.chemin)}`;
    const md = todoVersMarkdown(todo, { sujet, cheminImage: chemin });
    const zip = creerZip([
      { nom: `${base}.md`, octets: encodeur.encode(md) },
      { nom: chemin, octets: new Uint8Array(await blob.arrayBuffer()) },
    ]);
    return enregistrerFichier(new Blob([zip], { type: "application/zip" }), `${base}.zip`);
  }
  const md = todoVersMarkdown(todo, { sujet, imageIndisponible: indisponible });
  return enregistrerFichier(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
}
