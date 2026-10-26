/**
 * Page reader of the extension (V4.3): downloads a page and summarises it for the AI. The
 * network and the permission are here, the analysis is src/core/extraitPage.js. Extracts are
 * kept in memory only, briefly: no durable storage of page contents.
 */
import { analyserConfidentialite } from "../core/confidentialiteUrl.js";
import { extraireContenu, extraitReduit } from "../core/extraitPage.js";

const MAX_ENTREES = 50;
const DUREE_MS = 10 * 60 * 1000;
const cache = new Map();

/** For tests and the diagnostic tool. */
export const viderCacheExtraits = () => cache.clear();

function memoire(url) {
  const e = cache.get(url);
  if (!e) return null;
  if (Date.now() - e.date > DUREE_MS) {
    cache.delete(url);
    return null;
  }
  return e.extrait;
}

function retenir(url, extrait) {
  cache.delete(url);
  cache.set(url, { extrait, date: Date.now() });
  if (cache.size > MAX_ENTREES) cache.delete(cache.keys().next().value);
}

/**
 * @param {string} url
 * @param {{ lirePage: Function, permissions: { contient: () => Promise<boolean> }, signal?: AbortSignal }} deps
 * @returns {Promise<object|null>} the extract; a reduced one (url, domain, title only) where
 *   the privacy rules forbid reading; null without the site permission or when the page
 *   cannot be read.
 */
export async function lireExtrait(url, { lirePage, permissions, signal } = {}) {
  const regle = analyserConfidentialite(url);
  if (regle.raison === "invalide") return null;
  if (!regle.contenu) return extraitReduit(url);
  const connu = memoire(regle.url);
  if (connu) return connu;
  if (!(await permissions.contient().catch(() => false))) return null;
  const page = await lirePage(regle.url, { signal });
  if (!page) return null;
  const doc = new DOMParser().parseFromString(page.html, "text/html");
  const extrait = extraireContenu(doc, page.urlFinale || regle.url);
  retenir(regle.url, extrait);
  return extrait;
}
