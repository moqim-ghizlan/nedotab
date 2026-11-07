/**
 * Export of ONE todo as Markdown (V7.1). Pure: text in, text out. Everything the user wrote is
 * TEXT: its Markdown characters are escaped so a title or a description can never become a heading,
 * a link, an image or HTML in the file.
 */

const INTERDITS = /[\\/:*?"<>|]/g;
/** Control characters (code < 32) removed without a control-character regular expression. */
const sansControles = (t) => [...t].filter((c) => c.charCodeAt(0) > 31).join("");
const RESERVES_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export const NOM_FICHIER_MAX = 60;

/** A file name that every system accepts; an empty title gives "todo". */
export function nomFichierSain(titre, secours = "todo") {
  let nom = sansControles(String(titre ?? ""))
    .replace(INTERDITS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (nom.length > NOM_FICHIER_MAX) nom = nom.slice(0, NOM_FICHIER_MAX).trim();
  if (!nom || RESERVES_WINDOWS.test(nom)) return secours;
  return nom;
}

/** One line of text made inert for Markdown. */
export function echapperLigne(ligne) {
  return String(ligne)
    .replace(/([\\`*_[\]<>|~])/g, "\\$1")
    .replace(/^(\s*)([#>+-])/, "$1\\$2")
    .replace(/^(\s*\d+)([.)])/, "$1\\$2")
    .replace(/^(\s*)!/, "$1\\!");
}

/** Text with its line breaks kept (two spaces at the end of a line make a break). */
export function echapperTexte(texte) {
  const lignes = String(texte ?? "").replace(/\r\n?/g, "\n").split("\n");
  return lignes.map((l, i) => (i < lignes.length - 1 && l.trim() ? `${echapperLigne(l)}  ` : echapperLigne(l))).join("\n");
}

const quand = (ms) =>
  ms == null ? "" : new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * @param {object} todo { titre, description, creeLe, modifieLe }
 * @param {object} [o]
 * @param {string} [o.sujet] name of the subject
 * @param {string|null} [o.cheminImage] relative path of the picture inside the archive
 * @param {boolean} [o.imageIndisponible] the todo has a picture that could not be read
 * @returns {string}
 */
export function todoVersMarkdown(todo, { sujet = "", cheminImage = null, imageIndisponible = false } = {}) {
  const titre = String(todo?.titre ?? "").replace(/\s+/g, " ").trim();
  const sortie = [`# ${titre ? echapperLigne(titre) : "Sans titre"}`, ""];
  const infos = [];
  if (sujet) infos.push(`**Sujet** : ${echapperLigne(sujet)}`);
  if (todo?.creeLe != null) infos.push(`**Créé** : ${quand(todo.creeLe)}`);
  if (todo?.modifieLe != null && todo.creeLe != null && Math.abs(todo.modifieLe - todo.creeLe) > 60_000) infos.push(`**Modifié** : ${quand(todo.modifieLe)}`);
  if (todo?.fait) infos.push("**État** : fait");
  if (infos.length) sortie.push(infos.join("  \n"), "");
  if (todo?.description?.trim()) sortie.push(echapperTexte(todo.description), "");
  if (cheminImage) sortie.push(`![Image du todo](${cheminImage.replace(/ /g, "%20")})`, "");
  else if (imageIndisponible) sortie.push("_Image indisponible au moment de l'export._", "");
  return `${sortie.join("\n").trimEnd()}\n`;
}
