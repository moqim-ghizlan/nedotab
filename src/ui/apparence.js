import { estClaire, moyenne } from "../core/couleurs.js";
import { photoAuHasard, photoDuFond, tailleEcran, urlPhoto } from "../core/galerie.js";
import { plateforme } from "../platform/index.js";
import { cssDegrade, DEGRADES } from "./fonds.js";
import { dominante } from "./services/imageFond.js";

/**
 * Theme and background. A small startup cache (theme + plain colour) is kept in the page's
 * localStorage so that the first paint has the right colours before chrome.storage answers;
 * the real values stay in the synced state.
 */
const CLE_CACHE = "nedotab:demarrage";
const systemeSombre = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

let themeChoisi = "auto";
let urlImage = null;
let refImage = null;

function lireCache() {
  try {
    return JSON.parse(localStorage.getItem(CLE_CACHE)) ?? {};
  } catch {
    return {};
  }
}

function ecrireCache(cache) {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(cache));
  } catch {
    /* private mode or full storage: the cache is only a speed-up */
  }
}

function couche() {
  let fond = document.getElementById("fond");
  if (!fond) {
    fond = document.createElement("div");
    fond.id = "fond";
    fond.setAttribute("aria-hidden", "true");
    document.body.prepend(fond);
  }
  return fond;
}

const themeEffectif = () =>
  themeChoisi === "auto" ? (systemeSombre?.matches ? "sombre" : "clair") : themeChoisi;

export function appliquerTheme(theme) {
  themeChoisi = theme;
  document.documentElement.dataset.theme = themeEffectif();
}
systemeSombre?.addEventListener("change", () => {
  if (themeChoisi === "auto") appliquerTheme("auto");
});

/** A photo is shown: a picture of the user's or of the gallery (V2.13). */
const estPhoto = (fond) => ["image", "galerie", "aleatoire"].includes(fond.type);

/** Colour the background reduces to (plain colour, gradient average, image dominant). */
export function couleurDuFond(fond) {
  if (fond.type === "couleur") return fond.valeur;
  if (fond.type === "degrade") return moyenne(DEGRADES[fond.valeur].couleurs);
  if (estPhoto(fond) && fond.dominante) {
    // The veil darkens the picture: mix the dominant colour with black.
    const n = parseInt(fond.dominante.slice(1), 16);
    const v = 1 - fond.voile;
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * v));
    return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

/** Text over the background: dark on light backgrounds, light on dark ones. */
function appliquerLisibilite(couleur) {
  document.body.classList.toggle("fond-clair", !!couleur && estClaire(couleur));
  document.body.classList.toggle("fond-sombre", !!couleur && !estClaire(couleur));
}

/** First paint: theme and plain colour from the cache, synchronously. */
export function appliquerCacheDemarrage() {
  const cache = lireCache();
  appliquerTheme(cache.theme ?? "auto");
  if (cache.couleur) {
    const fond = couche();
    fond.style.backgroundColor = cache.couleur;
    fond.dataset.type = cache.type ?? "couleur";
    appliquerLisibilite(cache.couleur);
  }
}

let telechargerFondCompte = null;
/** Account mode: how to download a library picture (Firebase Storage, loaded on demand). */
export function configurerFondsCompte(telecharger) {
  telechargerFondCompte = telecharger;
}

/**
 * Blob of a library picture: from the local cache, else downloaded ONCE and cached. Storage
 * bandwidth is billed: the download URL is never used as the background of every tab.
 */
export async function blobFondCompte(fond) {
  const enCache = await plateforme.fichiers.lireCacheFond(fond.id).catch(() => null);
  if (enCache) return enCache;
  if (!telechargerFondCompte) return null;
  const blob = await telechargerFondCompte(fond.chemin).catch(() => null);
  if (blob) await plateforme.fichiers.ecrireCacheFond(fond.id, blob).catch(() => {});
  return blob;
}

async function afficherImage(fond, calque) {
  const cle = fond.id ? `compte:${fond.id}` : fond.ref;
  if (refImage === cle && urlImage) {
    calque.style.backgroundImage = `url("${urlImage}")`;
    return;
  }
  const blob = fond.id
    ? await blobFondCompte(fond)
    : await plateforme.fichiers.lireFond(fond.ref.slice("local:".length)).catch(() => null);
  if (!blob) return;
  if (urlImage) URL.revokeObjectURL(urlImage);
  urlImage = URL.createObjectURL(blob);
  refImage = cle;
  const img = new Image();
  img.src = urlImage;
  await img.decode().catch(() => {});
  calque.style.backgroundImage = `url("${urlImage}")`;
  calque.classList.add("fond-image--visible");
}

// --- gallery photos (V2.13) -----------------------------------------------------------------

const CLE_COULEURS = "nedotab:galerie-couleurs";
const CLE_SUIVANTE = "nedotab:galerie-suivante";
const lireJson = (cle) => {
  try {
    return JSON.parse(localStorage.getItem(cle)) ?? null;
  } catch {
    return null;
  }
};
const ecrireJson = (cle, valeur) => {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* only a speed-up */
  }
};

/** Pixels this screen shows: the photo is asked cropped to exactly that. */
const tailleIci = () =>
  tailleEcran({
    largeur: globalThis.screen?.width || innerWidth,
    hauteur: globalThis.screen?.height || innerHeight,
    densite: globalThis.devicePixelRatio || 1,
  });
const cleCache = (id, t) => `${id}:${t.largeur}x${t.hauteur}`;

/** The photo cropped to this screen: from the device cache, else downloaded once. */
async function blobGalerie(id, taille = tailleIci()) {
  const cle = cleCache(id, taille);
  const enCache = await plateforme.fichiers.lireGalerie(cle).catch(() => null);
  if (enCache) return enCache;
  const reponse = await fetch(urlPhoto(id, taille)).catch(() => null);
  if (!reponse?.ok) return null;
  const blob = await reponse.blob();
  await plateforme.fichiers.ecrireGalerie(cle, blob).catch(() => {});
  return blob;
}

/** Only the photo shown and the next one (each new tab) are kept on the device. */
async function purgerGalerie(garder) {
  const cles = await plateforme.fichiers.listerGalerie().catch(() => []);
  for (const cle of cles) {
    if (!garder.has(cle)) plateforme.fichiers.supprimerGalerie(cle).catch(() => {});
  }
}

/** Gallery photo shown on this tab, or null (the settings credit it and keep it). */
let idGalerie = null;
export const photoGalerieAffichee = () => idGalerie;

/** Photo drawn for this tab (random each new tab): the one the previous tab prepared. */
let photoOnglet = null;
function photoPourOnglet(categorie) {
  if (photoOnglet?.categorie === categorie) return photoOnglet.id;
  const preparee = lireJson(CLE_SUIVANTE);
  const id = preparee?.categorie === categorie ? preparee.id : photoAuHasard(categorie);
  photoOnglet = { categorie, id };
  return id;
}

/** Gallery or random background: the photo id shown here, with its known dominant colour. */
function photoAffichee(fond) {
  const onglet =
    fond.type === "aleatoire" && fond.frequence === "onglet"
      ? photoPourOnglet(fond.categorie)
      : null;
  const id = photoDuFond(fond, { onglet });
  return { id, dominante: lireJson(CLE_COULEURS)?.[id] ?? null };
}

/** Background photo of the gallery: shown, its colour learnt, the next tab's one prepared. */
async function afficherGalerie(fond, id, calque) {
  const taille = tailleIci();
  const cle = `galerie:${cleCache(id, taille)}`;
  if (refImage === cle && urlImage) {
    calque.style.backgroundImage = `url("${urlImage}")`;
    return;
  }
  const blob = await blobGalerie(id, taille);
  if (!blob) return; // offline and not cached yet: the colour stays
  if (urlImage) URL.revokeObjectURL(urlImage);
  urlImage = URL.createObjectURL(blob);
  refImage = cle;
  const img = new Image();
  img.src = urlImage;
  await img.decode().catch(() => {});
  calque.style.backgroundImage = `url("${urlImage}")`;
  calque.classList.add("fond-image--visible");
  const couleurs = lireJson(CLE_COULEURS) ?? {};
  if (!couleurs[id]) {
    try {
      couleurs[id] = dominante(img);
      // Few entries: the colours of the photos seen on this device.
      ecrireJson(CLE_COULEURS, couleurs);
      const vue = couleurDuFond({ ...fond, dominante: couleurs[id] });
      appliquerLisibilite(vue);
      ecrireCache({ ...lireCache(), couleur: couleurs[id] });
    } catch {
      /* the text keeps the theme's colours */
    }
  }
  const garder = new Set([cleCache(id, taille)]);
  if (fond.type === "aleatoire" && fond.frequence === "onglet") {
    // The next tab shows its photo at once: drawn and downloaded now.
    const suivante = photoAuHasard(fond.categorie, Math.random, id);
    ecrireJson(CLE_SUIVANTE, { categorie: fond.categorie, id: suivante });
    garder.add(cleCache(suivante, taille));
    blobGalerie(suivante, taille).catch(() => {});
  }
  purgerGalerie(garder);
}

/** Applies the settings (theme + background) and refreshes the startup cache. */
export async function appliquerReglages(reglages) {
  appliquerTheme(reglages.theme);
  const galerie = reglages.fond.type === "galerie" || reglages.fond.type === "aleatoire";
  const photo = galerie ? photoAffichee(reglages.fond) : null;
  idGalerie = photo?.id ?? null;
  const fond = galerie ? { ...reglages.fond, dominante: photo.dominante } : reglages.fond;
  const calque = couche();
  const couleur = couleurDuFond(fond);
  calque.dataset.type = estPhoto(fond) ? "image" : fond.type;
  calque.style.backgroundColor = estPhoto(fond) ? (fond.dominante ?? "") : (couleur ?? "");
  calque.style.backgroundImage = fond.type === "degrade" ? cssDegrade(fond.valeur) : "";
  calque.style.setProperty("--voile-fond", estPhoto(fond) ? String(fond.voile) : "0");
  calque.style.setProperty("--flou-fond", estPhoto(fond) ? `${fond.flou}px` : "0px");
  if (!estPhoto(fond)) {
    calque.classList.remove("fond-image--visible");
    if (urlImage) URL.revokeObjectURL(urlImage);
    urlImage = null;
    refImage = null;
  }
  appliquerLisibilite(couleur);
  ecrireCache({
    theme: reglages.theme,
    type: estPhoto(fond) ? "image" : fond.type,
    couleur: estPhoto(fond) ? fond.dominante : couleur,
  });
  if (fond.type === "image") await afficherImage(fond, calque);
  else if (photo?.id) await afficherGalerie(fond, photo.id, calque);
}
