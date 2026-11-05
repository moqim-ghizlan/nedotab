/**
 * Export of ONE todo to Markdown (V6.6). Pure: text in, text out. The export of a whole subject
 * was dropped on purpose (decision of the user): nothing here builds one.
 *
 * File format (documented in docs/exports.md; it is a contract, tested):
 *
 *   ---
 *   titre: "Rapport"            (JSON-quoted: ':', '#', quotes, line breaks cannot break it)
 *   cree: 2026-11-04            (ISO day, local; absent while the server date is unknown)
 *   modifie: 2026-11-05
 *   echeance: 2026-12-01        (or null)
 *   fait: false
 *   sujet: "Travail"
 *   ---
 *
 *   # Rapport
 *
 *   the description, EXACTLY as written (it already is Markdown)
 *
 *   ## Images
 *
 *   ![note](images/01.webp)
 *   *note*
 *
 * Images are never embedded in base64: the archive holds them in `images/` and the Markdown
 * points to them with RELATIVE paths, so the extracted folder opens well in Obsidian or VS Code.
 */
import { jourLocal } from "./echeances.js";
import { extensionPour } from "./imagesTodo.js";

export const NOM_MAX = 80;
export const SANS_TITRE = "sans-titre";

// Control characters and the characters that reverse the reading direction (RTL tricks).
// (The zero-width joiner U+200D stays: it glues the parts of an emoji such as a family.)
// eslint-disable-next-line no-control-regex
const TROMPEURS = /[\u0000-\u001f\u007f-\u009f\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const INTERDITS_WINDOWS = /[\\/:*?"<>|]/g;
const RESERVES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Cuts on whole user-perceived characters (an emoji, even a family one, is never cut in two). */
function couper(texte, max) {
  const segmenteur = globalThis.Intl?.Segmenter ? new Intl.Segmenter("fr", { granularity: "grapheme" }) : null;
  const morceaux = segmenteur ? [...segmenteur.segment(texte)].map((s) => s.segment) : [...texte];
  return morceaux.length <= max ? texte : morceaux.slice(0, max).join("");
}

/**
 * A file name that is valid on Windows and macOS: no `\ / : * ? " < > |`, no control or direction
 * character, no dot or space at the end, no reserved Windows name (CON, PRN, AUX, NUL, COM1…),
 * 80 characters at most, words joined by hyphens. An empty title gives "sans-titre".
 */
export function nomFichierSur(titre) {
  let nom = String(titre ?? "")
    .normalize("NFC")
    .replace(TROMPEURS, " ")
    .replace(INTERDITS_WINDOWS, " ")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-");
  nom = couper(nom, NOM_MAX);
  nom = nom.replace(/^[-.]+/, "").replace(/[-. ]+$/, "");
  if (!nom) return SANS_TITRE;
  // "CON", and also "CON.txt": Windows refuses both.
  if (RESERVES.test(nom.split(".")[0])) nom = `_${nom}`;
  return nom;
}

/** A value for the header: always a JSON string, which YAML reads as a double-quoted string. */
const yaml = (v) => JSON.stringify(String(v ?? "").replace(/\r\n?/g, "\n"));

const jour = (ms) => (Number.isFinite(ms) ? jourLocal(new Date(ms)) : null);

/** A note on one line, with the characters of `![ ]( )` escaped. */
function noteSurUneLigne(note) {
  return String(note ?? "")
    .replace(TROMPEURS, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const echapperAlt = (t) => t.replace(/\\/g, "\\\\").replace(/([[\]])/g, "\\$1");

/**
 * Names of the pictures in the archive: numbered, never made from the note (two pictures with the
 * same note cannot clash). `01.webp`, `02.jpg`…
 * @returns {{ id: string, nom: string }[]}
 */
export function nomsImages(images) {
  const largeur = Math.max(2, String(images.length).length);
  return images.map((image, i) => ({
    id: image.id,
    nom: `${String(i + 1).padStart(largeur, "0")}.${extensionPour(image.typeMime)}`,
  }));
}

/**
 * @param {object} todo
 * @param {{ nom?: string }|null} sujet
 * @param {{ images?: boolean }} [options] `images: false` for "Copier en Markdown" (text only)
 * @returns {string}
 */
export function todoVersMarkdown(todo, sujet, { images = true } = {}) {
  const titre = String(todo.titre ?? "").replace(/\s+/g, " ").trim();
  const entete = [
    "---",
    `titre: ${yaml(titre)}`,
    ...(jour(todo.creeLe) ? [`cree: ${jour(todo.creeLe)}`] : []),
    ...(jour(todo.modifieLe) ? [`modifie: ${jour(todo.modifieLe)}`] : []),
    `echeance: ${todo.echeance ?? "null"}`,
    `fait: ${todo.fait ? "true" : "false"}`,
    `sujet: ${yaml(sujet?.nom ?? "")}`,
    "---",
  ];
  const parties = [entete.join("\n"), `# ${titre || "Sans titre"}`];
  const description = String(todo.description ?? "").replace(/\r\n?/g, "\n");
  if (description.trim()) parties.push(description.replace(/\s+$/, ""));
  const liste = images ? (todo.images ?? []) : [];
  if (liste.length) {
    const noms = nomsImages(liste);
    const lignes = liste.map((image, i) => {
      const note = noteSurUneLigne(image.note);
      const ligne = `![${echapperAlt(note)}](images/${noms[i].nom})`;
      return note ? `${ligne}\n*${note.replace(/\*/g, "\\*")}*` : ligne;
    });
    parties.push(`## Images\n\n${lignes.join("\n\n")}`);
  }
  return `${parties.join("\n\n")}\n`;
}

/** True for a path that cannot write outside its folder when the archive is extracted. */
export const cheminZipSur = (chemin) =>
  typeof chemin === "string" &&
  chemin !== "" &&
  !chemin.startsWith("/") &&
  !/^[a-z]:/i.test(chemin) &&
  !chemin.includes("\\") &&
  !chemin.split("/").some((p) => p === ".." || p === "." || p === "");

/**
 * What goes into the archive of a todo with pictures: `titre/titre.md` and `titre/images/NN.ext`.
 * @returns {{ dossier: string, fichierMd: string, images: { id: string, chemin: string }[], cheminMd: string }}
 */
export function planArchive(todo) {
  const base = nomFichierSur(todo.titre);
  const noms = nomsImages(todo.images ?? []);
  const plan = {
    dossier: base,
    fichierMd: `${base}.md`,
    cheminMd: `${base}/${base}.md`,
    images: noms.map((n) => ({ id: n.id, chemin: `${base}/images/${n.nom}` })),
  };
  for (const chemin of [plan.cheminMd, ...plan.images.map((i) => i.chemin)])
    if (!cheminZipSur(chemin)) throw new Error("chemin d'archive refusé");
  return plan;
}

/** Name of the file given to the user: `.zip` when there are pictures, `.md` otherwise. */
export const nomExport = (todo) => `${nomFichierSur(todo.titre)}.${(todo.images ?? []).length ? "zip" : "md"}`;
