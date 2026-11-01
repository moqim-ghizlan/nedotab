// Copy of src/core/listeCompacte.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Compact list of the sites of a grid, sent to the model for the smart search (V4.9). Shared
 * by the browser (tests) and the server (functions/src/partage/, identical copy). Pure.
 *
 * One line per site, as short as possible:
 *   s12|titre|domaine|tag1,tag2|description tronquée|Travail>Clients|AAAA-MM
 * The id is a short index ("s12"): the real ids stay in `table`, so the model never handles
 * long identifiers and an invented one is recognised (and dropped).
 */
import { domaine } from "./url.js";

export const DESCRIPTION_LISTE_MAX = 120;
export const CHAMPS_LISTE = ["titre", "domaine", "tags", "description", "chemin", "ajoute"];

/** Every site of a grid (all levels), with the titles of the folders that contain it. */
export function sitesDe(grille) {
  const sites = [];
  const visiter = (liste, chemin) => {
    if (!Array.isArray(liste)) return;
    for (const e of liste) {
      if (!e || typeof e !== "object") continue;
      // V4.20: "Ne pas montrer à l'IA" — the element and, for a folder, all its content stay out.
      if (e.iaExclu === true) continue;
      if (e.type === "dossier") visiter(e.items, [...chemin, String(e.titre ?? "")]);
      else if (e.type === "site" && typeof e.id === "string" && e.id) {
        sites.push({
          id: e.id,
          titre: String(e.titre ?? ""),
          url: String(e.url ?? ""),
          tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === "string") : [],
          description: typeof e.description === "string" ? e.description : "",
          chemin,
          creeLe: Number.isFinite(e.creeLe) ? e.creeLe : 0,
        });
      }
    }
  };
  visiter(grille, []);
  return sites;
}

/**
 * A field of a line: no "|", no line break, and never a closing "</sites>" (the list is data,
 * delimited by <sites>…</sites>, which a site must not be able to close).
 */
const champ = (texte) =>
  String(texte ?? "")
    .replace(/<\/?(?:sites|dossiers)>/gi, " ")
    .replace(/[|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tronquer = (texte, max) =>
  texte.length <= max ? texte : `${texte.slice(0, max - 1).trimEnd()}…`;

/** "AAAA-MM" of the adding date, "" when unknown. */
function moisAjout(creeLe) {
  if (!(creeLe > 0)) return "";
  const date = new Date(creeLe);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 7);
}

/**
 * @param {ReturnType<typeof sitesDe>} sites
 * @param {{ champs?: string[] }} [options] fields to send (all by default); a field left out
 *   stays an empty column, so the format does not change.
 * @returns {{ lignes: string[], table: Record<string, string> }} `table`: "s12" → real id
 */
export function construireListe(sites, { champs = CHAMPS_LISTE } = {}) {
  const avec = new Set(champs);
  const table = {};
  const lignes = sites.map((s, i) => {
    const court = `s${i + 1}`;
    table[court] = s.id;
    return [
      court,
      avec.has("titre") ? champ(s.titre) : "",
      avec.has("domaine") ? champ(domaine(s.url)) : "",
      avec.has("tags") ? s.tags.map(champ).filter(Boolean).join(",") : "",
      avec.has("description") ? tronquer(champ(s.description), DESCRIPTION_LISTE_MAX) : "",
      avec.has("chemin") ? s.chemin.map(champ).join(">") : "",
      avec.has("ajoute") ? moisAjout(s.creeLe) : "",
    ].join("|");
  });
  return { lignes, table };
}

export const DOSSIERS_LISTE_MAX = 200;

/** Every folder of a grid (all levels): id, titles from home down to it, sites inside. */
export function dossiersDe(grille) {
  const dossiers = [];
  const compter = (items) =>
    items.reduce(
      (n, e) =>
        n +
        (e?.iaExclu === true
          ? 0
          : e?.type === "site"
            ? 1
            : e?.type === "dossier"
              ? compter(e.items ?? [])
              : 0),
      0,
    );
  const visiter = (liste, chemin) => {
    if (!Array.isArray(liste)) return;
    for (const e of liste) {
      if (e?.type !== "dossier" || typeof e.id !== "string" || !e.id || e.iaExclu === true) continue;
      const ici = [...chemin, String(e.titre ?? "")];
      dossiers.push({ id: e.id, chemin: ici, nbSites: compter(e.items ?? []) });
      visiter(e.items, ici);
    }
  };
  visiter(grille, []);
  return dossiers;
}

/**
 * One line per folder: d3|Travail>Clients|12 (short id, titles from home, sites inside). The
 * short ids "dN" are the model's way to name a folder (V4.16); the real ids stay in `table`.
 */
export function construireListeDossiers(dossiers) {
  const table = {};
  const lignes = dossiers.slice(0, DOSSIERS_LISTE_MAX).map((d, i) => {
    const court = `d${i + 1}`;
    table[court] = d.id;
    return [court, d.chemin.map(champ).join(">"), d.nbSites].join("|");
  });
  return { lignes, table };
}
