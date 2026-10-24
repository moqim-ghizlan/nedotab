import { estClaire, moyenne } from "../core/couleurs.js";
import { plateforme } from "../platform/index.js";
import { cssDegrade, DEGRADES } from "./fonds.js";

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

/** Colour the background reduces to (plain colour, gradient average, image dominant). */
export function couleurDuFond(fond) {
  if (fond.type === "couleur") return fond.valeur;
  if (fond.type === "degrade") return moyenne(DEGRADES[fond.valeur].couleurs);
  if (fond.type === "image") {
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
async function blobFondCompte(fond) {
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

/** Applies the settings (theme + background) and refreshes the startup cache. */
export async function appliquerReglages(reglages) {
  appliquerTheme(reglages.theme);
  const fond = reglages.fond;
  const calque = couche();
  const couleur = couleurDuFond(fond);
  calque.dataset.type = fond.type;
  calque.style.backgroundColor = fond.type === "image" ? fond.dominante : (couleur ?? "");
  calque.style.backgroundImage = fond.type === "degrade" ? cssDegrade(fond.valeur) : "";
  calque.style.setProperty("--voile-fond", fond.type === "image" ? String(fond.voile) : "0");
  calque.style.setProperty("--flou-fond", fond.type === "image" ? `${fond.flou}px` : "0px");
  if (fond.type !== "image") {
    calque.classList.remove("fond-image--visible");
    if (urlImage) URL.revokeObjectURL(urlImage);
    urlImage = null;
    refImage = null;
  }
  appliquerLisibilite(couleur);
  ecrireCache({
    theme: reglages.theme,
    type: fond.type,
    couleur: fond.type === "image" ? fond.dominante : couleur,
  });
  if (fond.type === "image") await afficherImage(fond, calque);
}
