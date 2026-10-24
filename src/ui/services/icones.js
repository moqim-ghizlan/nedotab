import { couleurDepuisTexte } from "../../core/couleurs.js";
import { classerIcones, extraireInfos, iconesDuManifeste } from "../../core/infosPage.js";
import { domaine, domainesParents } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";

const DEBUG = import.meta.env.DEV && globalThis.localStorage?.getItem?.("debug") === "1";
const journal = (...args) => DEBUG && console.debug("[icones]", ...args);

/** Loads an image; resolves to the element when loaded, null on error or timeout. */
export function chargerImage(src, { delai = 4000, signal } = {}) {
  return new Promise((resolve) => {
    if (!src || signal?.aborted) return resolve(null);
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    const fin = (valeur) => {
      clearTimeout(minuteur);
      signal?.removeEventListener("abort", annuler);
      img.onload = img.onerror = null;
      resolve(valeur);
    };
    const annuler = () => fin(null);
    const minuteur = setTimeout(annuler, delai);
    signal?.addEventListener("abort", annuler, { once: true });
    img.onload = () => fin(img);
    img.onerror = () => fin(null);
    img.src = src;
  });
}

/** 16x16 pixel fingerprint of an image, null if the canvas is tainted (cross-origin). */
export function empreinte(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 16, 16);
    const donnees = ctx.getImageData(0, 0, 16, 16).data;
    let h = 2166136261;
    for (let i = 0; i < donnees.length; i++) h = Math.imul(h ^ (donnees[i] >> 3), 16777619) >>> 0;
    return h.toString(16);
  } catch {
    return null;
  }
}

const estSvg = (src) => /\.svg(\?|#|$)/i.test(src) || src.startsWith("data:image/svg");

/** An icon is usable when it is an SVG or at least 32 px wide. */
async function iconeValide(src, options) {
  const img = await chargerImage(src, options);
  if (!img) return false;
  return (
    estSvg(src) || img.naturalWidth >= 32 || (img.naturalWidth === 0 && img.naturalHeight === 0)
  );
}

let empreinteGlobe;
/** Fingerprint of Chrome's generic globe, computed once from a non-existent address. */
export function globeNavigateur() {
  empreinteGlobe ??= (async () => {
    const src = plateforme.urlFaviconNavigateur("https://inconnu.invalid");
    const img = src && (await chargerImage(src));
    return img ? empreinte(img) : null;
  })();
  return empreinteGlobe;
}

async function depuisHtml(url, signal, meilleur) {
  if (!(await plateforme.permissionsSites.contient().catch(() => false))) return null;
  const page = await plateforme.lirePage(url, { signal });
  if (!page) return null;
  const doc = new DOMParser().parseFromString(page.html, "text/html");
  const infos = extraireInfos(doc, page.urlFinale, url);
  meilleur.titre = infos.titre;
  let candidats = infos.icones;
  if (infos.manifeste) {
    const json = await plateforme.lireJson(infos.manifeste, { signal });
    if (json) candidats = [...candidats, ...iconesDuManifeste(json, infos.manifeste)];
  }
  for (const c of classerIcones(candidats)) {
    if (signal?.aborted) return null;
    journal("candidat", c);
    if (await iconeValide(c.href, { signal }))
      return { type: "url", valeur: c.href, source: "html" };
  }
  return null;
}

async function depuisNavigateur(url, signal) {
  const src = plateforme.urlFaviconNavigateur(url, 64);
  if (!src) return null;
  const [img, globe] = await Promise.all([chargerImage(src, { signal }), globeNavigateur()]);
  if (!img) return null;
  const e = empreinte(img);
  if (!e || e === globe) return null;
  return { type: "url", valeur: src, source: "chrome" };
}

export function urlFaviconGoogle(url, nom = domaine(url)) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(nom)}&sz=128`;
}

/** Google's icon URLs to try: the site's domain, then its parent domains. */
export const urlsFaviconGoogle = (url) => domainesParents(url).map((d) => urlFaviconGoogle(url, d));

async function depuisGoogle(url, signal) {
  for (const src of urlsFaviconGoogle(url)) {
    if (signal?.aborted) return null;
    const img = await chargerImage(src, { signal });
    // Google answers its 16 px default icon when it knows nothing: treat it as "no icon".
    if (img && img.naturalWidth >= 32) return { type: "url", valeur: src, source: "google" };
  }
  return null;
}

/**
 * Full chain: page HTML (if allowed) → Chrome favicon cache → Google → letter badge.
 * Never throws; capped at `delaiTotal` ms, after which the best result so far is returned.
 * Chrome's cache stores "chrome-extension://" URLs that only work in this browser, so they
 * are only used when nothing portable was found.
 * @returns {Promise<{ titre: string, icone: object }>}
 */
export async function trouverIconeEtTitre(url, { signal, delaiTotal = 8000 } = {}) {
  const lettre = { type: "lettre", couleur: couleurDepuisTexte(url) };
  const meilleur = { titre: domaine(url), icone: lettre };
  const chaine = (async () => {
    const etapes = [
      () => depuisHtml(url, signal, meilleur),
      () => depuisGoogle(url, signal),
      () => depuisNavigateur(url, signal),
    ];
    for (const etape of etapes) {
      if (signal?.aborted) break;
      const icone = await etape().catch(() => null);
      if (icone) {
        meilleur.icone = icone;
        break;
      }
    }
    return meilleur;
  })();
  let minuteur;
  const limite = new Promise((resolve) => {
    minuteur = setTimeout(() => resolve(meilleur), delaiTotal);
  });
  const resultat = await Promise.race([chaine, limite]);
  clearTimeout(minuteur);
  return { titre: resultat.titre, icone: { ...resultat.icone } };
}
