/**
 * Validation of what the model answers for the smart search (V4.9): the answer is untrusted
 * data. Only a JSON object (possibly inside a code fence) is accepted; ids that are not in the
 * list sent are dropped (never trusted), scores are bounded, doubles removed, 8 at most. The
 * short ids are turned back into the real ones.
 */
import { INTENTIONS, RESULTATS_MAX } from "./prompts/recherche.js";

export const RAISON_MAX = 120;

/**
 * The reason of a result: a short sentence for the user. Text only: HTML, URLs and line breaks
 * are removed, a too long one is cut at a word. Absent or unusable → null (the result is kept
 * without a reason, never rejected).
 */
export function nettoyerRaison(brut) {
  if (typeof brut !== "string") return null;
  let texte = brut
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (texte.length > RAISON_MAX) {
    texte = texte.slice(0, RAISON_MAX - 1);
    const dernierEspace = texte.lastIndexOf(" ");
    if (dernierEspace > RAISON_MAX / 2) texte = texte.slice(0, dernierEspace);
    texte = `${texte.replace(/[\s,;:.]+$/, "")}…`;
  }
  return texte || null;
}

/**
 * @param {string} texte raw answer of the model
 * @param {Record<string, string>} table short id → real id
 * @returns {{ intention: "site"|"question"|"les_deux", resultats: { id: string, score: number, raison?: string }[], aucunResultat: boolean } | null}
 *   null when the answer is not usable (then one retry, then "reponse-invalide")
 */
export function lireSortieRecherche(texte, table) {
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
  if (!Array.isArray(objet.resultats)) return null;
  const vus = new Set();
  const resultats = [];
  for (const r of objet.resultats) {
    const court = typeof r?.id === "string" ? r.id.trim() : "";
    if (!Object.hasOwn(table, court) || vus.has(court)) continue;
    vus.add(court);
    const brutScore = Number(r.score);
    const score = Number.isFinite(brutScore) ? Math.min(1, Math.max(0, brutScore)) : 0;
    const raison = nettoyerRaison(r.raison);
    resultats.push({ id: table[court], score, ...(raison ? { raison } : {}) });
    if (resultats.length === RESULTATS_MAX) break;
  }
  // V4.13: an unknown or missing intention is "site" (the behaviour of V4.9).
  const intention = INTENTIONS.includes(objet.intention) ? objet.intention : "site";
  return { intention, resultats, aucunResultat: resultats.length === 0 };
}
