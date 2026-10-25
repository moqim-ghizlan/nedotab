/**
 * Background gallery (V2.13): photos of the catalogue, cropped by Unsplash's image CDN to
 * the size of the screen that shows them (a photo is never downloaded whole to show only a
 * part of it), and the random background (each new tab, each day, or on request).
 */
import { CATEGORIES_GALERIE, PHOTOS_GALERIE } from "./catalogueGalerie.js";

export { CATEGORIES_GALERIE };
export const TOUTES = "toutes";
export const FREQUENCES = ["onglet", "jour", "clic"];
/** Key of a photo on images.unsplash.com. */
export const ID_PHOTO = /^photo-\d{9,16}-[0-9a-f]{6,16}$/;
export const COTE_MAX_PX = 3840;
const PAS_PX = 160;

export const estIdPhoto = (id) => typeof id === "string" && ID_PHOTO.test(id);
export const estCategorie = (c) => c === TOUTES || CATEGORIES_GALERIE.some((x) => x.id === c);

const enObjet = ([id, page, auteur, pseudo]) => ({ id, page, auteur, pseudo });

/** Photos of a category, or of all of them (each photo once), in catalogue order. */
export function photosDe(categorie = TOUTES) {
  if (categorie !== TOUTES) return (PHOTOS_GALERIE[categorie] ?? []).map(enObjet);
  const vues = new Set();
  const toutes = [];
  for (const { id } of CATEGORIES_GALERIE) {
    for (const p of PHOTOS_GALERIE[id]) {
      if (vues.has(p[0])) continue;
      vues.add(p[0]);
      toutes.push(enObjet(p));
    }
  }
  return toutes;
}

/** The catalogue entry of `id`, or null (a photo from a newer catalogue still shows). */
export function trouverPhoto(id) {
  for (const liste of Object.values(PHOTOS_GALERIE)) {
    const p = liste.find((x) => x[0] === id);
    if (p) return enObjet(p);
  }
  return null;
}

/**
 * Pixels to ask for a screen: its size × pixel density, the width rounded up (fewer distinct
 * sizes, so the CDN and the cache are reused) and the height from the screen's exact
 * proportions, the longest side at most COTE_MAX_PX.
 */
export function tailleEcran({ largeur, hauteur, densite = 1 }) {
  const l = Math.max(1, largeur * densite);
  const proportion = Math.max(1, hauteur * densite) / l;
  let arrondie = Math.ceil(l / PAS_PX) * PAS_PX;
  arrondie = Math.min(arrondie, COTE_MAX_PX, Math.floor(COTE_MAX_PX / proportion));
  return { largeur: arrondie, hauteur: Math.round(arrondie * proportion) };
}

const BASE = "https://images.unsplash.com/";

/** The photo cropped to exactly `largeur` × `hauteur` (what the screen shows). */
export const urlPhoto = (id, { largeur, hauteur }) =>
  `${BASE}${id}?w=${largeur}&h=${hauteur}&fit=crop&crop=entropy&auto=format&q=80`;

/** Small 16:9 picture for the gallery. */
export const urlVignette = (id) => `${BASE}${id}?w=400&h=225&fit=crop&auto=format&q=70`;

/** Page of the photo and of its author on Unsplash (credit). */
const SUIVI = "utm_source=nedotab&utm_medium=referral";
export const urlPagePhoto = (photo) => `https://unsplash.com/photos/${photo.page}?${SUIVI}`;
export const urlAuteur = (photo) => `https://unsplash.com/@${photo.pseudo}?${SUIVI}`;

/** Small stable hash of a text (FNV-1a). */
function hacher(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const jourDe = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The photo of the day for a category: the same on every device all day long. */
export function photoDuJour(categorie, date = new Date()) {
  const liste = photosDe(categorie);
  if (!liste.length) return null;
  return liste[hacher(`${jourDe(date)}:${categorie}`) % liste.length].id;
}

/** A photo drawn at random in a category, other than `sauf` when possible. */
export function photoAuHasard(categorie, hasard = Math.random, sauf = null) {
  const liste = photosDe(categorie).filter((p) => p.id !== sauf);
  if (!liste.length) return sauf;
  return liste[Math.floor(hasard() * liste.length)].id;
}

/**
 * Photo shown for a gallery or random background. `onglet`: the photo drawn for this tab
 * (each new tab draws one); `date`: today.
 */
export function photoDuFond(fond, { date = new Date(), onglet = null } = {}) {
  if (fond?.type === "galerie") return fond.id;
  if (fond?.type !== "aleatoire") return null;
  if (fond.frequence === "jour") return photoDuJour(fond.categorie, date);
  if (fond.frequence === "clic") return fond.choix ?? photoDuJour(fond.categorie, date);
  return onglet ?? photoDuJour(fond.categorie, date);
}
