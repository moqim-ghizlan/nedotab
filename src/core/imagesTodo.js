/**
 * Images of a todo (V6.4). Pure: validation, dimensions, safe names, limits. Everything that
 * comes from a file (its name, its declared type) is hostile: the type is checked here, again by
 * the Storage rules, and finally by really decoding the picture (compresserImage.js).
 *
 * Image: { id, chemin, note, taille, typeMime, largeur, hauteur, ordre } in the field `images`
 * of the todo (10 at most). The file lives in Storage under `todos/{uid}/{todoId}/{id}.{ext}`
 * with its thumbnail `{id}_mini.{ext}`; NEVER a download address (public token) in the database.
 */
import { formaterTaille, niveauQuota, texteQuota } from "./espacePartageFichiers.js";

export { formaterTaille, niveauQuota, texteQuota };

export const IMAGES_MAX = 10;
export const COTE_MAX = 1920;
export const COTE_MINI = 240;
export const POIDS_MAX = 5 * 1024 * 1024;
export const QUOTA_MAX = 200 * 1024 * 1024;
export const NOTE_MAX = 300;
export const ECART = 1000;

/** The only types kept: declared type → extension of the stored file. */
export const TYPES_IMAGE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const EXTENSIONS_ACCEPTEES = ["jpg", "jpeg", "png", "webp"];

const extensionDe = (nom) => /\.([a-z0-9]{1,8})$/i.exec(String(nom ?? ""))?.[1].toLowerCase() ?? "";

/**
 * Whether a picture may be added. `fichier` = { name, size, type }.
 * @returns {{ ok: true } | { ok: false, code: string, erreur: string }}
 */
export function validerImage(fichier, { nbImages = 0, octetsUtilises = 0 } = {}) {
  const type = String(fichier?.type ?? "").toLowerCase();
  const ext = extensionDe(fichier?.name);
  const taille = Number(fichier?.size);
  if (nbImages >= IMAGES_MAX)
    return { ok: false, code: "limite", erreur: `${IMAGES_MAX} images au maximum par todo.` };
  if (type.includes("svg") || ext === "svg")
    return { ok: false, code: "svg", erreur: "Les images SVG ne sont pas acceptées." };
  if (type === "image/gif" || ext === "gif")
    return { ok: false, code: "gif", erreur: "Les GIF ne sont pas acceptés : utilisez JPEG, PNG ou WebP." };
  if (/heic|heif/.test(type) || ["heic", "heif"].includes(ext))
    return {
      ok: false,
      code: "heic",
      erreur: "Le format HEIC n'est pas pris en charge : choisissez la photo en JPEG, ou exportez-la.",
    };
  if (!(type in TYPES_IMAGE) || (ext && !EXTENSIONS_ACCEPTEES.includes(ext)))
    return { ok: false, code: "type", erreur: "Ce fichier n'est pas une image JPEG, PNG ou WebP." };
  if (!Number.isFinite(taille) || taille <= 0)
    return { ok: false, code: "vide", erreur: "Ce fichier est vide." };
  // The weight before compression is not limited here: a photo is reduced first (POIDS_MAX is
  // checked on the result). Only an absurd file is refused at once.
  if (taille > 50 * 1024 * 1024)
    return { ok: false, code: "trop-gros", erreur: "Cette image est trop lourde (50 Mo au maximum)." };
  if (octetsUtilises >= QUOTA_MAX)
    return { ok: false, code: "quota", erreur: "Espace d'images plein : supprimez des images pour en ajouter." };
  return { ok: true };
}

/** The result of the compression must fit the rules of Storage. */
export function validerResultat(taille, octetsUtilises = 0) {
  if (taille > POIDS_MAX)
    return { ok: false, code: "poids", erreur: "Cette image reste trop lourde après réduction (5 Mo au maximum)." };
  if (octetsUtilises + taille > QUOTA_MAX)
    return { ok: false, code: "quota", erreur: "Espace d'images plein : supprimez des images pour en ajouter." };
  return { ok: true };
}

/**
 * Target size: the longest side is reduced to `max`, the ratio kept, never enlarged.
 * @returns {{ largeur: number, hauteur: number, reduite: boolean }}
 */
export function dimensionsCible(largeur, hauteur, max = COTE_MAX) {
  const l = Math.max(1, Math.round(largeur));
  const h = Math.max(1, Math.round(hauteur));
  const plusLong = Math.max(l, h);
  if (plusLong <= max) return { largeur: l, hauteur: h, reduite: false };
  const echelle = max / plusLong;
  return {
    largeur: Math.max(1, Math.round(l * echelle)),
    hauteur: Math.max(1, Math.round(h * echelle)),
    reduite: true,
  };
}

/** Extension of a stored file for a declared type ("webp" when unknown). */
export const extensionPour = (typeMime) => TYPES_IMAGE[String(typeMime).toLowerCase()] ?? "webp";

/** 32 hexadecimal characters: the name of the file in Storage, never the name of the original. */
export function nouvelIdImage(aleatoire = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...aleatoire(16)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

export const cheminImage = (uid, todoId, imageId, ext) => `todos/${uid}/${todoId}/${imageId}.${ext}`;
/** `.../{id}.webp` → `.../{id}_mini.webp` */
export const cheminMini = (chemin) => String(chemin).replace(/\.([a-z0-9]+)$/i, "_mini.$1");

/** True when the path is of the shape `todos/{uid}/{todoId}/{32 hex}.{ext}` of this user. */
export const cheminValide = (uid, chemin) =>
  new RegExp(`^todos/${uid}/[^/]+/[0-9a-f]{32}\\.(jpg|png|webp)$`).test(String(chemin));

// Control characters and direction marks never belong to a note.
const INTERDITS = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;
/** Note cleaned (plain text, 300 characters). */
export const nettoyerNote = (note) =>
  [...String(note ?? "").replace(INTERDITS, " ").replace(/[ \t]+/g, " ").trim()].slice(0, NOTE_MAX).join("");

/** Metadata to store in the todo. */
export function creerMetaImage({ id, chemin, taille, typeMime, largeur, hauteur, note = "", ordre = ECART }) {
  return { id, chemin, note: nettoyerNote(note), taille, typeMime, largeur, hauteur, ordre };
}

/** The order after the last image. */
export const ordreSuivant = (images) => Math.max(0, ...images.map((i) => i.ordre ?? 0)) + ECART;

/** Bytes used by the images of a list of todos (what the counter `octets` holds). */
export const octetsDesImages = (images) =>
  (images ?? []).reduce((s, i) => s + (Number.isFinite(i?.taille) ? i.taille : 0), 0);

/** Paths of the files (picture and thumbnail) to delete for a list of images. */
export const cheminsDeFichiers = (images) =>
  (images ?? []).flatMap((i) => (typeof i?.chemin === "string" ? [i.chemin, cheminMini(i.chemin)] : []));

/** "2 images" / "1 image" / "" */
export const libelleNombre = (n) => (n <= 0 ? "" : n === 1 ? "1 image" : `${n} images`);
