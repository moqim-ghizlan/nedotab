// Copy of src/core/lienPartage.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Public share links (V4.28). Pure: no DOM, no Firebase. Identical copy in
 * functions/src/partage/lienPartage.js (a test compares them).
 *
 *   https://<project>.web.app/r#<token>.<key>
 *
 * Everything after "#" is never sent to a server by the browser: the token (public identifier
 * of the link, 256 random bits) and the key (encrypts the copy, 256 random bits).
 */
import { DUREES } from "./expirationPartage.js";

export const OCTETS_JETON = 32;
export const OCTETS_CLE = 32;
export const OUVERTURES_PROPOSEES = [1, 5, 10, 25, 0]; // 0 = unlimited (within the duration)
export const LIENS_ACTIFS_MAX = 20;
export const CREATIONS_PAR_HEURE = 10;
export const ESSAIS_MAX = 5;
export const RECU_MS = 2 * 60_000;
/** Text/link copies live in Firestore (1 MB per document); files go through a JSON request. */
export const TEXTE_MAX_OCTETS = 700_000;
export const FICHIER_MAX_OCTETS = 5 * 1024 * 1024;
export const TYPES = ["texte", "lien", "fichier"];
export const MESSAGE_INDISPONIBLE = "Ce lien n'est plus disponible.";

const B64U = /^[A-Za-z0-9_-]+$/;
const b64uLongueur = (octets) => Math.ceil((octets * 8) / 6);

const versB64u = (octets) => {
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const aleatoire = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A new token and a new key (base64url). */
export const genererLien = () => ({
  jeton: versB64u(aleatoire(OCTETS_JETON)),
  cle: versB64u(aleatoire(OCTETS_CLE)),
});

/** The complete link; the key stays in the fragment. */
export const formaterLien = (origine, jeton, cle) =>
  `${String(origine).replace(/\/$/, "")}/r#${jeton}.${cle}`;

/** True for a well-formed token (what the server accepts as an identifier). */
export const jetonValide = (jeton) =>
  typeof jeton === "string" && B64U.test(jeton) && jeton.length === b64uLongueur(OCTETS_JETON);

/**
 * Reads a link or a fragment ("#token.key"). A link copied without its "#…" part is
 * "incomplet" (the content is then unreadable for good).
 * @returns {{ ok: true, jeton: string, cle: string } | { ok: false, raison: "incomplet" | "invalide" }}
 */
export function analyserLien(texte) {
  const t = String(texte ?? "").trim();
  const i = t.indexOf("#");
  const fragment = i >= 0 ? t.slice(i + 1) : "";
  if (!fragment) return { ok: false, raison: "incomplet" };
  const [jeton, cle, reste] = fragment.split(".");
  if (reste !== undefined || !cle) return { ok: false, raison: "incomplet" };
  if (!jetonValide(jeton) || !B64U.test(cle) || cle.length !== b64uLongueur(OCTETS_CLE))
    return { ok: false, raison: "invalide" };
  return { ok: true, jeton, cle };
}

/**
 * Whether a link may be opened now. Same answer for unknown, expired, exhausted and revoked
 * (nothing for an attacker to learn); only a locked link is told apart, and only to someone
 * who already holds the token.
 * @param {{ expireLe: number, ouverturesMax: number, ouvertures: number, revoque?: boolean, suspendu?: boolean, essais?: number } | null | undefined} lien
 * @returns {"ok" | "indisponible" | "verrouille"}
 */
export function decisionOuverture(lien, maintenant) {
  if (!lien || lien.revoque || lien.suspendu) return "indisponible";
  if (!Number.isFinite(lien.expireLe) || lien.expireLe <= maintenant) return "indisponible";
  if (lien.ouverturesMax > 0 && lien.ouvertures >= lien.ouverturesMax) return "indisponible";
  if ((lien.essais ?? 0) >= ESSAIS_MAX) return "verrouille";
  return "ok";
}

/** Checks the parameters of a creation. @returns {string|null} an error message */
export function validerCreation({ type, dureeId, ouverturesMax, tailleChiffree, motDePasse }) {
  if (!TYPES.includes(type)) return "Type d'élément inconnu.";
  if (!DUREES.some((d) => d.id === dureeId)) return "Durée inconnue.";
  if (type === "fichier" && dureeId === "jamais")
    return "Un lien vers un fichier dure 30 jours au plus.";
  if (!OUVERTURES_PROPOSEES.includes(ouverturesMax)) return "Nombre d'ouvertures inconnu.";
  if (typeof motDePasse !== "boolean") return "Paramètre de mot de passe manquant.";
  const max = type === "fichier" ? FICHIER_MAX_OCTETS : TEXTE_MAX_OCTETS;
  if (!Number.isInteger(tailleChiffree) || tailleChiffree <= 0) return "Contenu vide.";
  if (tailleChiffree > max)
    return type === "fichier"
      ? "Fichier trop gros pour un lien (5 Mo au plus)."
      : "Texte trop long pour un lien.";
  return null;
}

/** "2 ouvertures sur 5" / "2 ouvertures". */
export const libelleOuvertures = (l) =>
  l.ouverturesMax > 0
    ? `${l.ouvertures} ouverture${l.ouvertures > 1 ? "s" : ""} sur ${l.ouverturesMax}`
    : `${l.ouvertures} ouverture${l.ouvertures > 1 ? "s" : ""}`;

/**
 * What a link carries, before encryption: a small JSON header (type, name, MIME type) then the
 * bytes. 4 bytes (big-endian) give the length of the header.
 */
export function emballer({ type, nom = "", typeMime = "", octets }) {
  const entete = new TextEncoder().encode(JSON.stringify({ t: type, n: nom, m: typeMime }));
  const sortie = new Uint8Array(4 + entete.length + octets.length);
  new DataView(sortie.buffer).setUint32(0, entete.length);
  sortie.set(entete, 4);
  sortie.set(octets, 4 + entete.length);
  return sortie;
}

/** @returns {{ type: string, nom: string, typeMime: string, octets: Uint8Array } | null} null when malformed */
export function deballer(donnees) {
  try {
    const n = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength).getUint32(0);
    if (n > 4096 || 4 + n > donnees.length) return null;
    const h = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(donnees.subarray(4, 4 + n)),
    );
    if (!TYPES.includes(h.t)) return null;
    return {
      type: h.t,
      nom: String(h.n ?? "").slice(0, 200),
      typeMime: String(h.m ?? "").slice(0, 100),
      octets: donnees.subarray(4 + n),
    };
  } catch {
    return null;
  }
}

/** An http(s) address only: `javascript:`, `data:`… are never a link to open. */
export function adresseSure(texte) {
  try {
    const u = new URL(String(texte).trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Control characters, bidirectional (RTL) marks and path / reserved characters of a file name. */
const CARACTERES_INTERDITS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}${String.fromCharCode(8234)}-${String.fromCharCode(8238)}${String.fromCharCode(8294)}-${String.fromCharCode(8297)}/\\\\:*?"<>|]`,
  "g",
);

/** A file name safe to propose for a download (no path, no control or direction characters). */
export const nomSur = (nom) =>
  String(nom ?? "")
    .normalize("NFC")
     
    .replace(CARACTERES_INTERDITS, "")
    .replace(/^\.+/, "")
    .slice(0, 100) || "fichier";
