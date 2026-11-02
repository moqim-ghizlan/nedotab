/**
 * Files and images of the sharing space (V4.25). Pure: validation, safe names, icon family,
 * quota, sizes. Everything that comes from a file (its name, its type) is treated as hostile.
 */

export const TAILLE_MAX = 25 * 1024 * 1024;
export const QUOTA_MAX = 200 * 1024 * 1024;
export const TAILLE_MAX_RESEAU_MOBILE = 10 * 1024 * 1024;
export const NOM_SUR_MAX = 100;
export const NOM_AFFICHE_MAX = 200;
export const TRANSFERTS_SIMULTANES = 2;

/** Executables and scripts, refused by extension (the Storage rules say the same). */
export const EXTENSIONS_REFUSEES = [
  "exe", "msi", "bat", "cmd", "sh", "js", "jar", "apk", "dmg", "scr", "ps1",
  "com", "vbs", "hta", "lnk", "reg",
];

/** …and by declared type (declared by the client: a safeguard, not a proof). */
export const TYPES_REFUSES =
  /^(application\/(x-msdownload|x-dosexec|x-msdos-program|x-sh|x-shellscript|x-msi|java-archive|vnd\.android\.package-archive|x-apple-diskimage|javascript|x-javascript|x-powershell)|text\/(javascript|x-shellscript))$/i;

/** Control characters and the characters that reverse the reading direction (RTL tricks). */
const CARACTERES_TROMPEURS = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]",
  "g",
);

const normalise = (s) => String(s ?? "").normalize("NFC");

/** The whole name, cleaned but NOT shortened (the checks must see the real extension). */
const nettoyer = (nom) =>
  normalise(nom).replace(CARACTERES_TROMPEURS, "").replace(/\s+/g, " ").trim() || "fichier";

/** The name shown: trimmed, without control or direction characters, never empty. */
export function nomAffiche(nom) {
  return [...nettoyer(nom)].slice(0, NOM_AFFICHE_MAX).join("");
}

/** Last extension in lower case, "" when there is none. */
export function extensionDe(nom) {
  const m = nettoyer(nom).match(/\.([^.\s/\\]{1,16})$/);
  return m ? m[1].toLowerCase() : "";
}

/**
 * The name used in the Storage path: no "/", "\\" or "..", no direction characters, NFC, at
 * most 100 characters (the extension is kept). The real name stays in Firestore.
 */
export function nomSur(nom) {
  const base = nettoyer(nom)
    .replace(/[/\\]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/[^\p{L}\p{N}._ ()+-]/gu, "_")
    .replace(/^\.+/, "");
  const ext = extensionDe(base);
  let propre = [...(base || "fichier")];
  if (propre.length > NOM_SUR_MAX) {
    const fin = ext ? `.${ext}` : "";
    propre = [...propre.slice(0, NOM_SUR_MAX - fin.length), ...fin];
  }
  return propre.join("") || "fichier";
}

/** True for any extension of the list, at any place of a "double extension" name. */
export function nomRefuse(nom) {
  const parties = nettoyer(nom).toLowerCase().split(".").slice(1);
  return parties.some((p) => EXTENSIONS_REFUSEES.includes(p.trim()));
}

/**
 * Whether a file may be sent. `fichier` = { name, size, type }.
 * @returns {{ ok: true } | { ok: false, erreur: string, code: string }}
 */
export function validerFichier(fichier, { octetsUtilises = 0 } = {}) {
  const taille = Number(fichier?.size);
  if (!Number.isFinite(taille) || taille <= 0)
    return { ok: false, code: "vide", erreur: "Ce fichier est vide." };
  if (taille > TAILLE_MAX)
    return { ok: false, code: "trop-gros", erreur: `Maximum ${formaterTaille(TAILLE_MAX)} par fichier.` };
  if (nomRefuse(fichier.name) || TYPES_REFUSES.test(String(fichier.type ?? "")))
    return { ok: false, code: "type", erreur: "Ce type de fichier n'est pas accepté." };
  if (octetsUtilises + taille > QUOTA_MAX)
    return { ok: false, code: "quota", erreur: "Espace plein : libérez de l'espace pour envoyer ce fichier." };
  return { ok: true };
}

/** MIME type to declare: the browser's one when it looks valid, otherwise a neutral type. */
export function typeDeclare(fichier) {
  const t = String(fichier?.type ?? "").toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(t) && t.length <= 100 ? t : "application/octet-stream";
}

/** "3,2 Mo", "840 Ko", "12 o". */
export function formaterTaille(octets) {
  const n = Number(octets);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0).replace(".", ",")} Ko`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} Mo`.replace(",0 ", " ");
}

/** Families: image, pdf, document, tableur, archive, audio, video, autre. */
export function familleDe(nom, type = "") {
  const ext = extensionDe(nom);
  const t = String(type).toLowerCase();
  if (t.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif", "bmp", "svg"].includes(ext))
    return "image";
  if (t === "application/pdf" || ext === "pdf") return "pdf";
  if (t.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"].includes(ext)) return "audio";
  if (t.startsWith("video/") || ["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["xls", "xlsx", "csv", "ods", "numbers", "tsv"].includes(ext)) return "tableur";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"].includes(ext)) return "archive";
  if (["doc", "docx", "odt", "rtf", "txt", "md", "ppt", "pptx", "odp", "pages", "key", "epub"].includes(ext) || t.startsWith("text/"))
    return "document";
  return "autre";
}

export const ICONES_FAMILLE = {
  image: "🖼️",
  pdf: "📕",
  document: "📄",
  tableur: "📊",
  archive: "🗜️",
  audio: "🎵",
  video: "🎞️",
  autre: "📎",
};

/**
 * A thumbnail is made only for raster images the browser shows safely. SVG and HTML are NEVER
 * previewed (they can hold scripts); HEIC often cannot be shown on a computer: the family
 * icon is used then.
 */
export function apercuPossible(nom, type = "") {
  const ext = extensionDe(nom);
  const t = String(type).toLowerCase();
  if (t.includes("svg") || ext === "svg" || t.includes("html") || ["html", "htm", "xhtml"].includes(ext)) return false;
  return /^image\/(jpeg|png|gif|webp|avif)$/.test(t) || ["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext);
}

/** Types shown only as a download (no preview, no inline display). */
export const telechargementSeulement = (nom, type = "") => {
  const ext = extensionDe(nom);
  const t = String(type).toLowerCase();
  return t.includes("svg") || ext === "svg" || t.includes("html") || ["html", "htm", "xhtml"].includes(ext);
};

/** A warning before downloading an archive or an unusual type, or null. */
export function avertissementTelechargement(nom, type = "") {
  const famille = familleDe(nom, type);
  if (famille === "archive") return "Archive : n'ouvrez que des fichiers dont vous connaissez l'origine.";
  if (telechargementSeulement(nom, type)) return "Ce fichier peut contenir du code : il est téléchargé, jamais affiché.";
  if (famille === "autre") return "Type de fichier peu courant : vérifiez-le avant de l'ouvrir.";
  return null;
}

/**
 * Name truncated in the middle to keep the extension: "rapport-final…2026.pdf".
 */
export function tronquerMilieu(nom, max = 28) {
  const signes = [...nomAffiche(nom)];
  if (signes.length <= max) return signes.join("");
  const ext = extensionDe(nom);
  const fin = ext ? `.${ext}` : "";
  const corps = signes.slice(0, signes.length - fin.length);
  const gardes = max - fin.length - 1;
  const debut = Math.ceil(gardes * 0.6);
  const queue = gardes - debut;
  return `${corps.slice(0, debut).join("")}…${queue > 0 ? corps.slice(-queue).join("") : ""}${fin}`;
}

/** Storage path of a file: `partages/{uid}/{id}/{safe name}` (a folder at the root, V4.27). */
export const cheminStockage = (uid, id, nom) => `partages/${uid}/${id}/${nomSur(nom)}`;

/** Quota level for the bar: ok, avertissement (>= 80 %), plein (>= 100 %). */
export function niveauQuota(octets, max = QUOTA_MAX) {
  const part = max > 0 ? octets / max : 0;
  return { part: Math.min(1, Math.max(0, part)), niveau: part >= 1 ? "plein" : part >= 0.8 ? "avertissement" : "ok" };
}

/** Text of the quota bar: "38 Mo sur 200 Mo". */
export const texteQuota = (octets, max = QUOTA_MAX) => `${formaterTaille(octets)} sur ${formaterTaille(max)}`;

/**
 * A queue that runs at most `max` jobs at once (two transfers: a 25 MB file is one Blob in
 * memory). `ajouter(job)` returns the job's promise.
 */
export function creerFile(max = TRANSFERTS_SIMULTANES) {
  let actifs = 0;
  const attente = [];
  const suivant = () => {
    while (actifs < max && attente.length) {
      const { job, ok, ko } = attente.shift();
      actifs++;
      Promise.resolve()
        .then(job)
        .then(ok, ko)
        .finally(() => {
          actifs--;
          suivant();
        });
    }
  };
  return {
    ajouter: (job) => new Promise((ok, ko) => (attente.push({ job, ok, ko }), suivant())),
    actifs: () => actifs,
    enAttente: () => attente.length,
  };
}
