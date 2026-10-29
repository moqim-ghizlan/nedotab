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
    .replace(/<\/?sites>/gi, " ")
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
