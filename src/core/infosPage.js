/**
 * Pure analysis of a fetched page: title and icon candidates.
 * Receives a parsed Document (DOMParser in the browser, happy-dom in tests); never fetches.
 */
import { domaine } from "./url.js";

const SEPARATEURS = [" | ", " - ", " – ", " — ", " · ", " : ", " • "];
const TITRES_PARASITES = [
  "connexion",
  "se connecter",
  "login",
  "log in",
  "sign in",
  "signin",
  "before you continue",
  "avant d'accéder à",
  "just a moment",
  "un instant",
  "attention required",
  "access denied",
  "accès refusé",
  "403 forbidden",
  "404 not found",
  "page not found",
  "redirecting",
  "loading",
  "chargement",
];

function normaliserEspaces(texte) {
  return String(texte ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const simplifier = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

/** Cleans a page title: spaces, long "A | B - C" titles, parasite titles, 60 chars max. */
export function nettoyerTitre(titre, nomDomaine = "") {
  let t = normaliserEspaces(titre);
  if (!t) return nomDomaine;
  if (t.length > 30) {
    if (SEPARATEURS.some((s) => t.includes(s))) {
      const segments = t
        .split(new RegExp(SEPARATEURS.map((s) => s.replace(/[|.]/g, "\\$&")).join("|")))
        .map(normaliserEspaces)
        .filter(Boolean);
      const racine = simplifier(nomDomaine.split(".").slice(0, -1).join("") || nomDomaine);
      const ressemblant = racine
        ? segments.find((s) => {
            const x = simplifier(s);
            return x && (x.includes(racine) || racine.includes(x));
          })
        : null;
      t = ressemblant ?? segments.reduce((a, b) => (b.length < a.length ? b : a));
    }
  }
  const bas = t
    .toLowerCase()
    .replace(/[.…!:\s]+$/u, "")
    .trim();
  if (TITRES_PARASITES.some((p) => bas === p || bas.startsWith(`${p} `))) {
    return nomDomaine;
  }
  if (t.length > 60) t = `${t.slice(0, 59).trimEnd()}…`;
  return t;
}

function absolue(href, base) {
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Largest declared size ("16x16 32x32" → 32, "any" → Infinity, missing → 0). */
export function lireTaille(sizes) {
  if (!sizes) return 0;
  let max = 0;
  for (const s of String(sizes).toLowerCase().split(/\s+/)) {
    if (s === "any") return Infinity;
    const m = s.match(/^(\d+)x(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * @param {Document} doc
 * @param {string} urlBase final URL after redirects
 * @param {string} [urlDemandee] URL typed by the user (its domain is the fallback title)
 * @returns {{ titre: string, icones: {href:string,taille:number,type:string,rel:string}[], manifeste: string|null }}
 */
export function extraireInfos(doc, urlBase, urlDemandee = urlBase) {
  const nomDomaine = domaine(urlDemandee);
  const baseHref = doc.querySelector("base[href]")?.getAttribute("href");
  const base = (baseHref && absolue(baseHref, urlBase)) || urlBase;
  const meta = (sel) => normaliserEspaces(doc.querySelector(sel)?.getAttribute("content"));
  const brut =
    meta('meta[property="og:site_name"]') ||
    normaliserEspaces(doc.querySelector("title")?.textContent) ||
    meta('meta[property="og:title"]');
  const titre = nettoyerTitre(brut, nomDomaine);

  const icones = [];
  const vus = new Set();
  for (const lien of doc.querySelectorAll("link[rel][href]")) {
    const rels = lien.getAttribute("rel").toLowerCase().split(/\s+/);
    if (rels.includes("mask-icon")) continue;
    const rel = rels.find((r) => r === "icon" || r.startsWith("apple-touch-icon"));
    if (!rel) continue;
    const href = absolue(lien.getAttribute("href"), base);
    if (!href || vus.has(href)) continue;
    vus.add(href);
    icones.push({
      href,
      taille: lireTaille(lien.getAttribute("sizes")),
      type: (lien.getAttribute("type") || "").toLowerCase(),
      rel,
    });
  }
  const implicite = absolue("/favicon.ico", urlBase);
  if (implicite && !vus.has(implicite))
    icones.push({ href: implicite, taille: 0, type: "", rel: "implicite" });

  const manifesteHref = doc.querySelector('link[rel="manifest"][href]')?.getAttribute("href");
  return { titre, icones, manifeste: manifesteHref ? absolue(manifesteHref, base) : null };
}

/** Icons of a web app manifest (JSON), largest first, >= 128 px only. */
export function iconesDuManifeste(json, urlManifeste) {
  const liste = Array.isArray(json?.icons) ? json.icons : [];
  return liste
    .map((i) => ({
      href: i?.src ? absolue(i.src, urlManifeste) : null,
      taille: lireTaille(i?.sizes),
      type: String(i?.type || "").toLowerCase(),
      rel: "manifeste",
      masquable:
        String(i?.purpose || "").includes("maskable") && !String(i?.purpose).includes("any"),
    }))
    .filter((i) => i.href && i.taille >= 128 && !i.masquable)
    .sort((a, b) => b.taille - a.taille);
}

const estSvg = (i) => i.type === "image/svg+xml" || /\.svg(\?|#|$)/i.test(i.href);

function rang(i) {
  if (i.rel.startsWith("apple-touch-icon")) return 0;
  if (estSvg(i)) return 1;
  const ico = /\.ico(\?|#|$)/i.test(i.href) || i.type === "image/x-icon";
  if (i.rel === "icon" && !ico && i.taille >= 64) return 2;
  if (i.rel === "manifeste") return 3;
  if (i.rel === "icon" && !ico) return 4;
  if (i.rel === "icon") return 5;
  return 6;
}

/** Orders candidates: apple-touch-icon, SVG, large PNG, manifest icons, small ones, /favicon.ico. */
export function classerIcones(candidats) {
  return [...candidats].sort((a, b) => rang(a) - rang(b) || b.taille - a.taille);
}
