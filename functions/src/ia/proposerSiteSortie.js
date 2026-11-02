/**
 * Validation of what the model answers for "fill the form" (V4.29): the answer is untrusted
 * data. A JSON object (possibly inside a code fence); tags and description go through the same
 * cleaning as the tags use; the title is short, without HTML nor address; an unknown folder
 * becomes "accueil". The folder is returned as a REAL id (the model only knows "dN").
 */
import { normaliserTags } from "./normalisationTags.js";
import { nettoyerDescription } from "./tagsSortie.js";

export const TITRE_MAX = 60;
const MOTIF_URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const MOTIF_HTML = /<[^>]*>/g;

export function nettoyerTitre(texte) {
  return [
    ...String(texte ?? "")
      .replace(MOTIF_HTML, " ")
      .replace(MOTIF_URL, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, TITRE_MAX)
    .join("")
    .trim();
}

/**
 * @param {string} texte
 * @param {{ dossiers: Record<string, string> }} contexte table "dN" → real folder id
 * @returns {{ titre: string, tags: string[], description: string, dossier: string } | null}
 */
export function lireSortieProposition(texte, { dossiers = {} } = {}) {
  if (typeof texte !== "string") return null;
  let brut = texte.trim();
  const clos = brut.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (clos) brut = clos[1];
  let o;
  try {
    o = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  if (typeof o.titre !== "string" || !Array.isArray(o.tags) || typeof o.description !== "string")
    return null;
  const titre = nettoyerTitre(o.titre);
  const tags = normaliserTags(o.tags.map((t) => String(t).replace(MOTIF_HTML, " ")));
  if (!titre || tags.length === 0) return null;
  const dossier =
    typeof o.dossier === "string" && Object.hasOwn(dossiers, o.dossier)
      ? dossiers[o.dossier]
      : "accueil";
  return { titre, tags, description: nettoyerDescription(o.description), dossier };
}
