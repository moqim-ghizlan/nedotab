/**
 * Replay of local operations on the last known server state (V2.9). The reducer is the only
 * logic: an operation that no longer applies (target deleted elsewhere, depth exceeded after
 * a change elsewhere) leaves the state unchanged and is reported as ignored, never thrown.
 */
import { A, reduire } from "./actions.js";
import { trouver } from "./arbre.js";

/** Why an operation that changed nothing was ignored, or null when there was nothing to do. */
function raison(etat, action) {
  const existe = (id) => !!trouver(etat.grille, id);
  const parentDe = (id) => trouver(etat.grille, id)?.parent?.id ?? null;
  switch (action.type) {
    case A.SITE_MODIFIER:
    case A.DOSSIER_RENOMMER:
      return existe(action.id) ? null : "INTROUVABLE";
    case A.ELEMENT_DEPLACER:
      if (!existe(action.id)) return "INTROUVABLE";
      if (action.versParentId != null && !existe(action.versParentId)) return null; // at the end
      return parentDe(action.id) === (action.versParentId ?? null) ? null : "REFUSE";
    case A.DOSSIER_CREER:
      return existe(action.dossier?.id) ? null : "REFUSE";
    case A.FUSIONNER:
      if (!existe(action.sourceId) || !existe(action.cibleId)) return "INTROUVABLE";
      if (action.nouveauDossierId && existe(action.nouveauDossierId)) return null;
      return parentDe(action.sourceId) === action.cibleId ? null : "REFUSE";
    case A.SITE_AJOUTER:
      return existe(action.site?.id) ? null : "REFUSE";
    default:
      return null;
  }
}

/**
 * Applies one action. @returns {{ etat, appliquee: boolean, raison: string|null }}
 * raison: "INTROUVABLE" (target gone), "REFUSE" (no longer allowed), "ERREUR" (exception).
 */
export function appliquer(etat, action) {
  try {
    const suivant = reduire(etat, action);
    if (suivant !== etat) return { etat: suivant, appliquee: true, raison: null };
    const r = raison(etat, action);
    return { etat, appliquee: !r, raison: r };
  } catch {
    return { etat, appliquee: false, raison: "ERREUR" };
  }
}

/**
 * Replays `operations` ({ idOp, action, ... }) in order on `etat`.
 * @returns {{ etat, ignorees: Array<{ operation, raison }> }}
 */
export function rejouer(etat, operations) {
  let courant = etat;
  const ignorees = [];
  for (const operation of operations) {
    const r = appliquer(courant, operation.action);
    courant = r.etat;
    if (!r.appliquee) ignorees.push({ operation, raison: r.raison });
  }
  return { etat: courant, ignorees };
}

const guillemets = (t) => `« ${t} »`;

/**
 * Readable description of an action, computed when it is queued (the element may be gone
 * when it is reported). @returns {{ libelle: string, nature: "site"|"dossier"|null }}
 */
export function decrire(etat, action) {
  const element = (id) => trouver(etat.grille, id)?.element;
  const titre = (id) => element(id)?.titre ?? "?";
  const nature = (id) => element(id)?.type ?? null;
  switch (action.type) {
    case A.SITE_AJOUTER:
      return { libelle: `Ajouter ${guillemets(action.site?.titre ?? "?")}`, nature: "site" };
    case A.SITE_MODIFIER: {
      const cles = Object.keys(action.changements ?? {});
      const verbe = cles.length === 1 && cles[0] === "titre" ? "Renommer" : "Modifier";
      return { libelle: `${verbe} ${guillemets(titre(action.id))}`, nature: "site" };
    }
    case A.DOSSIER_RENOMMER:
      return { libelle: `Renommer ${guillemets(titre(action.id))}`, nature: "dossier" };
    case A.ELEMENT_SUPPRIMER:
    case A.DOSSIER_SUPPRIMER:
      return { libelle: `Supprimer ${guillemets(titre(action.id))}`, nature: nature(action.id) };
    case A.ELEMENT_DEPLACER:
      return { libelle: `Déplacer ${guillemets(titre(action.id))}`, nature: nature(action.id) };
    case A.DOSSIER_CREER:
      return {
        libelle: `Créer le dossier ${guillemets(action.dossier?.titre ?? "?")}`,
        nature: "dossier",
      };
    case A.FUSIONNER:
      return {
        libelle: `Regrouper ${guillemets(titre(action.sourceId))} et ${guillemets(titre(action.cibleId))}`,
        nature: nature(action.sourceId),
      };
    case A.ELEMENT_RESTAURER:
      return {
        libelle: `Remettre ${guillemets(action.element?.titre ?? "?")}`,
        nature: action.element?.type ?? null,
      };
    case A.REGLAGES_MODIFIER:
    case A.FOND_AJOUTER:
    case A.FOND_SUPPRIMER:
      return { libelle: "Modifier l'apparence", nature: null };
    case A.GRILLE_RESTAURER:
      return { libelle: "Restaurer une sauvegarde", nature: null };
    default:
      return { libelle: "Modifier la grille", nature: null };
  }
}

/** "Renommer « GitHub » → ignoré, site supprimé ailleurs". */
export function expliquer({ operation, raison: r }) {
  const quoi = operation.nature === "dossier" ? "dossier supprimé" : "site supprimé";
  const pourquoi =
    r === "INTROUVABLE" ? `${quoi} ailleurs` : "impossible après les changements faits ailleurs";
  return `${operation.libelle ?? "Modification"} → ignoré, ${pourquoi}`;
}

/** Toast text, or null when every operation was applied. */
export function messageIgnorees(n) {
  if (!n) return null;
  return n === 1
    ? "1 modification n'a pas pu être appliquée car les éléments ont été modifiés sur un autre appareil."
    : `${n} modifications n'ont pas pu être appliquées car les éléments ont été modifiés sur un autre appareil.`;
}
