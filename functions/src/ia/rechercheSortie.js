/**
 * Validation of what the model answers for the smart search (V4.9): the answer is untrusted
 * data. Only a JSON object (possibly inside a code fence) is accepted; ids that are not in the
 * list sent are dropped (never trusted), scores are bounded, doubles removed, 8 at most. The
 * short ids are turned back into the real ones.
 */
import { RESULTATS_MAX } from "./prompts/recherche.js";

/**
 * @param {string} texte raw answer of the model
 * @param {Record<string, string>} table short id → real id
 * @returns {{ resultats: { id: string, score: number }[], aucunResultat: boolean } | null}
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
    resultats.push({ id: table[court], score });
    if (resultats.length === RESULTATS_MAX) break;
  }
  return { resultats, aucunResultat: resultats.length === 0 };
}
