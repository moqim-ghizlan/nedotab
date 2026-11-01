/**
 * Validation of what the model answers for the tidying suggestions (V4.17): untrusted data.
 * Only a JSON object (possibly in a code fence); every action goes through validerActions with
 * the tables of THIS request, deletions and additions are dropped, at most 8 groups and 8 new
 * folders, a group without a valid action disappears. A group is an independent proposal in
 * the format of V4.16 (real ids), shown with the same confirmation card.
 */
import { validerActions } from "../partage/outils.js";
import { GROUPES_MAX, NOUVEAUX_DOSSIERS_MAX } from "./prompts/rangement.js";

const OUTILS_RANGEMENT = new Set(["creer_dossier", "deplacer", "renommer"]);
const phrase = (v, max) => {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, max) : null;
};

/**
 * @param {string} texte raw answer of the model
 * @param {{ sites: Record<string, string>, dossiers: Record<string, string> }} tables
 * @param {() => string} [genererId] ids of the proposals
 * @returns {{ groupes: { titre: string, explication: string, proposition: { id: string, actions: object[] } }[] } | null}
 *   null when the answer cannot be read (then one retry, then "reponse-invalide")
 */
export function lireSortieRangement(texte, tables, genererId = () => Math.random().toString(16).slice(2, 10)) {
  if (typeof texte !== "string") return null;
  let brut = texte.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(brut);
  if (fence) brut = fence[1];
  let objet;
  try {
    objet = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!objet || typeof objet !== "object" || !Array.isArray(objet.groupes)) return null;
  const groupes = [];
  let nouveaux = 0;
  for (const g of objet.groupes) {
    if (groupes.length >= GROUPES_MAX) break;
    const titre = phrase(g?.titre, 60);
    if (!titre || !Array.isArray(g.actions)) continue;
    // Deletions and additions are not part of the tidying: dropped BEFORE validation, so that
    // a "nouveau:i" keeps its meaning only for the actions that stay.
    const permises = g.actions.filter((a) => OUTILS_RANGEMENT.has(a?.outil));
    const { actions } = validerActions(permises, tables);
    const crees = actions.filter((a) => a.outil === "creer_dossier").length;
    if (!actions.length || nouveaux + crees > NOUVEAUX_DOSSIERS_MAX) continue;
    nouveaux += crees;
    groupes.push({
      titre,
      explication: phrase(g.explication, 200) ?? "",
      proposition: { id: genererId(), actions },
    });
  }
  return { groupes };
}
