/**
 * What leaves the app as a picture (V7.1): copied to the clipboard or downloaded. Pure.
 * The clipboard of Chrome only takes PNG, so any other picture is converted before the copy.
 */
import { nomFichierSain } from "./exportTodoMd.js";

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/bmp": "bmp" };

/** A picture the app can copy or download: an image/* type or extension, never an SVG (it can carry scripts). */
export function estImageSortie(nom, typeMime) {
  const type = String(typeMime ?? "").toLowerCase();
  const ext = String(nom ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (type.includes("svg") || ext === "svg") return false;
  if (type.startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp", "avif", "bmp"].includes(ext);
}

/** "webp" for image/webp ... falls back on the extension of the given name, then "png". */
export function extensionImage(typeMime, nom = "") {
  const type = String(typeMime ?? "").toLowerCase();
  if (EXTENSIONS[type]) return EXTENSIONS[type];
  const ext = String(nom).toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return ext === "jpeg" ? "jpg" : (ext ?? "png");
}

/** File name of a downloaded picture: its original name, else the clean title + the extension. */
export function nomTelechargementImage({ nomOrigine = "", titre = "", typeMime = "" } = {}) {
  if (nomOrigine && /\.[a-z0-9]{2,5}$/i.test(nomOrigine)) return nomFichierSain(nomOrigine.replace(/\.[a-z0-9]{2,5}$/i, "")) + `.${extensionImage(typeMime, nomOrigine)}`;
  return `${nomFichierSain(titre, "image")}.${extensionImage(typeMime, nomOrigine)}`;
}

/** Does the browser need a conversion before copying? Only PNG goes to the clipboard of Chrome. */
export const doitConvertirEnPng = (typeMime) => String(typeMime ?? "").toLowerCase() !== "image/png";
