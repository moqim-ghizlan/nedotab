/**
 * Validation of what the model answers for the tags use (V4.4): the answer is untrusted data.
 * Only a JSON object (possibly inside a code fence) is accepted; tags and description go
 * through the same normalisation as the browser's; URLs, e-mail addresses and HTML are removed.
 */
import { normaliserDescription, normaliserTags } from "./normalisationTags.js";

const MOTIF_URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const MOTIF_MAIL = /\S+@\S+\.\S+/g;
const MOTIF_HTML = /<[^>]*>/g;

export const nettoyerDescription = (texte) =>
  normaliserDescription(
    String(texte ?? "")
      .replace(MOTIF_HTML, " ")
      .replace(MOTIF_URL, " ")
      .replace(MOTIF_MAIL, " ")
      .replace(/\s+([.,;!?])/g, "$1"),
  );

/** @returns {{ tags: string[], description: string } | null} null when not valid */
export function lireSortieTags(texte) {
  if (typeof texte !== "string") return null;
  let brut = texte.trim();
  const clos = brut.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (clos) brut = clos[1];
  let objet;
  try {
    objet = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!objet || typeof objet !== "object" || Array.isArray(objet)) return null;
  if (!Array.isArray(objet.tags) || typeof objet.description !== "string") return null;
  const tags = normaliserTags(objet.tags.map((t) => String(t).replace(MOTIF_HTML, " ")));
  if (tags.length === 0) return null;
  return { tags, description: nettoyerDescription(objet.description) };
}
