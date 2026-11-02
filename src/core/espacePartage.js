/**
 * Sharing space (V4.24): texts and links sent from one device to the others. Pure: no DOM, no
 * Firebase. The content comes from the user AND from copied web pages: it is hostile by
 * default (it may hold HTML) and is only ever shown as text.
 *
 * Element: { id, type: "texte"|"lien", contenu, titre, creeLe (ms or null while pending),
 *            appareil, epingle }
 */
import { domaine, normaliserUrl } from "./url.js";

export const LIMITE_CARACTERES = 20_000;
export const LIMITE_ELEMENTS = 200;
export const PAGE_ELEMENTS = 50;
export const APERCU_CARACTERES = 160;
export const APPAREIL_MAX = 64;
export const TITRE_MAX = 200;

/** Characters of a text, counted by code points (an emoji counts for one). */
export const longueur = (texte) => [...String(texte ?? "")].length;

/**
 * "http:" and "https:" only: `javascript:`, `data:`, `file:`… become plain text.
 * @returns {string|null} the normalised address, or null
 */
export function urlSure(texte) {
  const t = String(texte ?? "").trim();
  if (!t || /\s/.test(t)) return null;
  // An explicit scheme other than http(s) is refused as is (normaliserUrl would prefix it).
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) return null;
  const r = normaliserUrl(t);
  if (!r.ok) return null;
  return /^https?:\/\//i.test(r.url) ? r.url : null;
}

/** "lien" when the whole content is one http(s) address, "texte" otherwise. */
export function detecterType(contenu) {
  return urlSure(contenu) ? "lien" : "texte";
}

/**
 * Checks a content before sending (the message is shown BEFORE the send, not after).
 * @returns {string|null} an error message, or null
 */
export function validerContenu(contenu) {
  const c = String(contenu ?? "");
  if (c.trim() === "") return "Saisissez un texte ou un lien.";
  const n = longueur(c);
  if (n > LIMITE_CARACTERES)
    return `${n.toLocaleString("fr-FR")} caractères : ${LIMITE_CARACTERES.toLocaleString("fr-FR")} au maximum.`;
  return null;
}

/** A short readable title: the domain of a link, the beginning of a text. */
export function titreDe(type, contenu) {
  if (type === "lien") return domaine(urlSure(contenu) ?? contenu) || String(contenu).slice(0, 60);
  return apercu(contenu, 60);
}

/**
 * New element to send. `type` is chosen by the user ("Enregistrer comme lien" is offered, never
 * applied alone): by default a text stays a text.
 * @returns {{ ok: true, element: object } | { ok: false, erreur: string }}
 */
export function creerElement({ contenu, type = "texte", appareil }) {
  const erreur = validerContenu(contenu);
  if (erreur) return { ok: false, erreur };
  let valeur = String(contenu);
  let t = type === "lien" ? "lien" : "texte";
  if (t === "lien") {
    const url = urlSure(valeur);
    if (!url) return { ok: false, erreur: "Ce n'est pas une adresse http ou https valide." };
    valeur = url;
  } else {
    valeur = valeur.replace(/\r\n/g, "\n");
  }
  return {
    ok: true,
    element: {
      type: t,
      contenu: valeur,
      titre: titreDe(t, valeur).slice(0, TITRE_MAX),
      appareil: String(appareil ?? "").slice(0, APPAREIL_MAX),
      epingle: false,
    },
  };
}

/** Beginning of a text on `max` code points, cut on a whole character, "…" if shortened. */
export function apercu(texte, max = APERCU_CARACTERES) {
  const propre = String(texte ?? "").replace(/\s+/g, " ").trim();
  const signes = [...propre];
  return signes.length <= max ? propre : `${signes.slice(0, max - 1).join("").trimEnd()}…`;
}

const cleDoublon = (type, contenu) =>
  type === "lien" ? `lien:${(urlSure(contenu) ?? contenu).toLowerCase().replace(/\/$/, "")}` : `texte:${String(contenu).trim()}`;

/** The element already holding the same content (same type), or undefined. */
export function trouverDoublon(elements, { type, contenu }) {
  const cle = cleDoublon(type, contenu);
  return elements.find((e) => cleDoublon(e.type, e.contenu) === cle);
}

/** Pinned first, then newest first; an element not yet confirmed by the server (creeLe null) on top. */
export function trier(elements) {
  const date = (e) => (e.creeLe == null ? Number.MAX_SAFE_INTEGER : e.creeLe);
  return [...elements].sort(
    (a, b) => Number(b.epingle === true) - Number(a.epingle === true) || date(b) - date(a),
  );
}

/** Elements from a Firestore document, aberrant ones dropped. */
export function lireElement(id, brut, enAttente = false) {
  if (!brut || typeof brut !== "object") return null;
  if (brut.type !== "texte" && brut.type !== "lien" && brut.type !== "fichier") return null;
  if (typeof brut.contenu !== "string") return null;
  const creeLe = brut.creeLe?.toMillis?.() ?? (Number.isFinite(brut.creeLe) ? brut.creeLe : null);
  // V4.25: a file holds its real name in `contenu`; the Storage path is `chemin` (never a URL).
  const fichier =
    brut.type === "fichier"
      ? {
          taille: Number.isFinite(brut.taille) && brut.taille > 0 ? brut.taille : 0,
          typeMime: typeof brut.typeMime === "string" ? brut.typeMime : "",
          chemin: typeof brut.chemin === "string" ? brut.chemin : "",
        }
      : {};
  return {
    ...fichier,
    id,
    type: brut.type,
    contenu: brut.contenu,
    titre: typeof brut.titre === "string" ? brut.titre : "",
    appareil: typeof brut.appareil === "string" ? brut.appareil : "",
    epingle: brut.epingle === true,
    // V4.27: expiry (ms, UTC); undefined for an item created before V4.27.
    expireLe: brut.expireLe?.toMillis?.() ?? (Number.isFinite(brut.expireLe) ? brut.expireLe : undefined),
    // V4.26: `contenu` is then an encrypted block (readable only with the vault key).
    chiffre: brut.chiffre === true,
    creeLe,
    enAttente,
  };
}

/** "il y a 3 min", "hier", "12 nov." */
export function ilYA(creeLe, maintenant = Date.now()) {
  if (creeLe == null) return "à l'instant";
  const s = Math.max(0, Math.round((maintenant - creeLe) / 1000));
  if (s < 45) return "à l'instant";
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return "hier";
  if (j < 7) return `il y a ${j} jours`;
  return new Date(creeLe).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** True when the counter says the space is full. */
export const estPlein = (nb) => nb >= LIMITE_ELEMENTS;

/** Export (RGPD): content, type, date and device of each element. */
export function exporterElements(elements) {
  return elements.map((e) => ({
    // V4.26: an encrypted item is exported as is (unreadable), flagged `chiffre`.
    ...(e.chiffre ? { chiffre: true } : {}),
    type: e.type,
    contenu: e.contenu,
    titre: e.titre,
    appareil: e.appareil,
    epingle: !!e.epingle,
    creeLe: e.creeLe ?? null,
    expireLe: e.expireLe ?? null,
    // A file is listed (name and size), never embedded: it is downloaded from the app.
    ...(e.type === "fichier" ? { taille: e.taille ?? 0, typeMime: e.typeMime ?? "" } : {}),
  }));
}
