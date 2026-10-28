// Copy of src/core/extraitPage.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Compact text summary of a fetched page (V4.3), for the AI that writes tags and a
 * description (V4.4). Pure: receives a parsed Document (DOMParser in the browser, happy-dom
 * in tests), never fetches. Scripts are never run by DOMParser.
 */
import { analyserConfidentialite } from "./confidentialiteUrl.js";
import { nettoyerTitre, titreParasite } from "./infosPage.js";
import { domaine } from "./url.js";

export const MAX_TEXTE = 2000;
export const MAX_TOTAL = 3000;
const MAX_TITRES = 10;
const MAX_TITRE = 120;
const MAX_MOTS_CLES = 15;

const SUPPRIMES = [
  "script, style, noscript, template, svg, iframe, canvas",
  "form, button, input, select, textarea",
  "nav, footer, header, aside",
  '[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]',
  '[role="dialog"], [role="alert"], [aria-hidden="true"], [hidden]',
].join(", ");

/** Words in an id or class that mark a cookie banner, a popup, an ad… (heuristic). */
export const MOTS_PARASITES = [
  "cookie",
  "consent",
  "gdpr",
  "banner",
  "popup",
  "modal",
  "newsletter",
  "subscribe",
  "advert",
  "ads",
];

const normaliser = (t) =>
  String(t ?? "")
    .replace(/\s+/g, " ")
    .trim();

function parasite(element) {
  const marque = `${element.getAttribute("id") ?? ""} ${element.getAttribute("class") ?? ""}`;
  // "ads" must be a word of its own ("loads", "heads" are fine).
  const mots = marque
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return MOTS_PARASITES.some((m) =>
    m === "ads" ? mots.includes("ads") : marque.toLowerCase().includes(m),
  );
}

/** Cuts at the end of a sentence, else of a word, within max characters. */
export function tronquerProprement(texte, max) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const phrase = Math.max(
    coupe.lastIndexOf(". "),
    coupe.lastIndexOf("! "),
    coupe.lastIndexOf("? "),
  );
  if (phrase > max * 0.5) return coupe.slice(0, phrase + 1);
  const mot = coupe.lastIndexOf(" ");
  return (mot > max * 0.6 ? coupe.slice(0, mot) : coupe).trimEnd();
}

/** Visible text of the main content, without menus, banners and repeated short lines. */
export function extraireTexte(doc) {
  const racine = doc.body;
  if (!racine) return "";
  for (const e of [...racine.querySelectorAll(SUPPRIMES)]) e.remove();
  for (const e of [...racine.querySelectorAll("[id], [class]")]) if (parasite(e)) e.remove();
  const principal = racine.querySelector('main, article, [role="main"]') ?? racine;

  // Block elements become lines, so that short menu leftovers can be told apart.
  const lignes = [];
  const blocs = principal.querySelectorAll(
    "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, dd, dt, pre, div",
  );
  const ajouter = (brut) => {
    const ligne = normaliser(brut);
    if (ligne) lignes.push(ligne);
  };
  if (blocs.length === 0) ajouter(principal.textContent);
  else {
    for (const b of blocs) {
      // A div that holds other blocks only repeats their text.
      if (b.tagName === "DIV" && b.querySelector("p, li, h1, h2, h3, h4, h5, h6, div")) continue;
      ajouter(b.textContent);
    }
    // Text directly under the container (no block around it).
    const direct = [...principal.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ");
    ajouter(direct);
  }
  // A short line (< 3 words) that comes back is a menu leftover: all its copies go.
  const compte = new Map();
  for (const l of lignes) compte.set(l, (compte.get(l) ?? 0) + 1);
  const garde = lignes.filter((l) => l.split(" ").length >= 3 || compte.get(l) === 1);
  return tronquerProprement(normaliser(garde.join(" ")), MAX_TEXTE);
}

function langueDe(doc) {
  const brute = doc.documentElement?.getAttribute("lang") || "";
  const og = doc.querySelector('meta[property="og:locale"]')?.getAttribute("content") || "";
  const code = (normaliser(brute) || normaliser(og)).replace("_", "-").split("-")[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

/** The reduced extract: where the content must not be (or could not be) read. */
export function extraitReduit(urlFinale, titre = "") {
  const { url } = analyserConfidentialite(urlFinale);
  const d = domaine(url);
  return {
    url,
    domaine: d,
    langue: null,
    titre: titre || d,
    description: null,
    motsCles: [],
    titres: [],
    texte: "",
    type: null,
    reduit: true,
  };
}

/**
 * @param {Document} doc
 * @param {string} urlFinale URL after redirects
 * @returns {object} an ExtraitPage (see docs/ia.md), 3 000 characters at most
 */
export function extraireContenu(doc, urlFinale) {
  const regle = analyserConfidentialite(urlFinale);
  const nomDomaine = domaine(regle.url);
  const meta = (sel) => normaliser(doc.querySelector(sel)?.getAttribute("content"));

  const brut =
    normaliser(doc.querySelector("title")?.textContent) || meta('meta[property="og:title"]');
  if (!regle.contenu) return extraitReduit(urlFinale, nettoyerTitre(brut, nomDomaine));
  // An error, login or consent page answered with 200: nothing worth reading.
  if (titreParasite(brut)) return extraitReduit(urlFinale);

  const titre = nettoyerTitre(meta('meta[property="og:site_name"]') || brut, nomDomaine);
  const description = meta('meta[name="description"]') || meta('meta[property="og:description"]');
  const motsCles = meta('meta[name="keywords"]')
    .split(",")
    .map(normaliser)
    .filter(Boolean)
    .slice(0, MAX_MOTS_CLES);

  // Headings first (before the cleaning removes the headers).
  const titres = [];
  for (const sel of ["h1", "h2"])
    for (const h of doc.querySelectorAll(sel)) {
      const t = normaliser(h.textContent);
      if (t && !titres.includes(t) && titres.length < MAX_TITRES)
        titres.push(t.slice(0, MAX_TITRE));
    }

  const extrait = {
    url: regle.url,
    domaine: nomDomaine,
    langue: langueDe(doc),
    titre,
    description: description ? description.slice(0, 500) : null,
    motsCles,
    titres,
    texte: extraireTexte(doc),
    type: meta('meta[property="og:type"]') || null,
  };
  // Final check: the text gives way first.
  const fixe = JSON.stringify({ ...extrait, texte: "" }).length;
  const place = Math.max(0, MAX_TOTAL - fixe);
  if (extrait.texte.length > place) extrait.texte = tronquerProprement(extrait.texte, place);
  return extrait;
}
