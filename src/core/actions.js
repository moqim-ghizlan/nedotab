/**
 * Actions are plain JSON objects ({ type, ...data }). The reducer is the only way to change
 * the state: it never mutates its input and returns a new object along the modified path.
 */
import {
  deplacer,
  fusionner,
  hauteur,
  inserer,
  modifierListe,
  niveauEmplacement,
  parcourir,
  peutCreerDossierDans,
  remplacer,
  retirer,
  trouver,
} from "./arbre.js";
import { PROFONDEUR_MAX } from "./constantes.js";
import { modifierReglagesEtat } from "./reglages.js";

export const A = {
  CHARGER: "CHARGER",
  SITE_AJOUTER: "SITE_AJOUTER",
  SITE_MODIFIER: "SITE_MODIFIER",
  ELEMENT_SUPPRIMER: "ELEMENT_SUPPRIMER",
  ELEMENT_RESTAURER: "ELEMENT_RESTAURER",
  ELEMENT_DEPLACER: "ELEMENT_DEPLACER",
  DOSSIER_CREER: "DOSSIER_CREER",
  DOSSIER_RENOMMER: "DOSSIER_RENOMMER",
  DOSSIER_SUPPRIMER: "DOSSIER_SUPPRIMER",
  GRILLE_REMPLACER: "GRILLE_REMPLACER",
  FUSIONNER: "FUSIONNER",
  REGLAGES_MODIFIER: "REGLAGES_MODIFIER",
  SYNCHRO_APPLIQUER: "SYNCHRO_APPLIQUER",
};

export const TITRE_DOSSIER_MAX = 40;

/** Folder title: trimmed, 1 to 40 characters, "Dossier" when empty. */
export function nettoyerTitreDossier(titre) {
  const t = String(titre ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t ? [...t].slice(0, TITRE_DOSSIER_MAX).join("") : "Dossier";
}

/**
 * Creates `dossier` in `parentId` at `index` and moves the elements listed in
 * `idsAInclure` into it, in grid order. `index` is the position in the list as it is
 * before the move; elements taken from before that position are accounted for.
 */
function creerDossier(grille, { dossier, parentId = null, index, idsAInclure = [] }) {
  if (trouver(grille, dossier.id)) return grille;
  if (!peutCreerDossierDans(grille, parentId)) return grille;
  const voulus = new Set(idsAInclure.filter((id) => id !== parentId));
  const inclus = [...parcourir(grille)].filter((e) => voulus.has(e.id));
  // An element inside another included folder moves with it.
  const racines = inclus.filter(
    (e) => !inclus.some((d) => d !== e && d.type === "dossier" && trouver(d.items, e.id)),
  );
  if (
    racines.some(
      (e) =>
        e.type === "dossier" && (e.id === parentId || (parentId && trouver(e.items, parentId))),
    )
  ) {
    return grille;
  }
  const nouveau = { ...dossier, items: [...dossier.items, ...racines] };
  if (niveauEmplacement(grille, parentId) + hauteur(nouveau) > PROFONDEUR_MAX) return grille;
  const liste = parentId == null ? grille : trouver(grille, parentId).element.items;
  let position = index ?? liste.length;
  for (let i = 0; i < Math.min(position, liste.length); i++) {
    if (racines.includes(liste[i])) position--;
  }
  let g = grille;
  for (const e of racines) g = retirer(g, e.id).grille;
  return inserer(g, nouveau, parentId, position);
}

function supprimerDossier(grille, { id, mode }) {
  const r = trouver(grille, id);
  if (r?.element.type !== "dossier") return grille;
  if (mode !== "viderDansParent") return retirer(grille, id).grille;
  return modifierListe(grille, r.parent?.id ?? null, (liste) =>
    liste.flatMap((e) => (e.id === id ? e.items : [e])),
  );
}

/** Fields of a site that SITE_MODIFIER may change. */
const CHAMPS_SITE = ["titre", "url", "icone"];

function filtrerChamps(changements, autorises) {
  return Object.fromEntries(
    Object.entries(changements ?? {}).filter(([cle]) => autorises.includes(cle)),
  );
}

const avecGrille = (etat, grille) => (grille === etat.grille ? etat : { ...etat, grille });

export function reduire(etat, action) {
  switch (action.type) {
    case A.CHARGER:
      return action.etat;
    case A.SITE_AJOUTER: {
      // Idempotent: replaying an action already applied elsewhere changes nothing.
      if (trouver(etat.grille, action.site.id)) return etat;
      return avecGrille(
        etat,
        inserer(etat.grille, action.site, action.parentId ?? null, action.index),
      );
    }
    case A.SITE_MODIFIER: {
      const changements = filtrerChamps(action.changements, CHAMPS_SITE);
      if (Object.keys(changements).length === 0) return etat;
      return avecGrille(
        etat,
        remplacer(etat.grille, action.id, (e) =>
          e.type === "site" ? { ...e, ...changements } : e,
        ),
      );
    }
    case A.ELEMENT_SUPPRIMER: {
      const r = retirer(etat.grille, action.id);
      return r ? avecGrille(etat, r.grille) : etat;
    }
    case A.ELEMENT_RESTAURER: {
      if (trouver(etat.grille, action.element.id)) return etat;
      // The original folder may have disappeared meanwhile: fall back to the root.
      const niveau = niveauEmplacement(etat.grille, action.parentId ?? null);
      const parentId =
        niveau >= 0 && niveau + hauteur(action.element) <= PROFONDEUR_MAX
          ? (action.parentId ?? null)
          : null;
      return avecGrille(etat, inserer(etat.grille, action.element, parentId, action.index));
    }
    case A.ELEMENT_DEPLACER:
      return avecGrille(
        etat,
        deplacer(etat.grille, action.id, action.versParentId ?? null, action.versIndex),
      );
    case A.DOSSIER_CREER:
      return avecGrille(etat, creerDossier(etat.grille, action));
    case A.DOSSIER_RENOMMER: {
      const titre = nettoyerTitreDossier(action.titre);
      return avecGrille(
        etat,
        remplacer(etat.grille, action.id, (e) =>
          e.type === "dossier" && e.titre !== titre ? { ...e, titre } : e,
        ),
      );
    }
    case A.DOSSIER_SUPPRIMER:
      return avecGrille(etat, supprimerDossier(etat.grille, action));
    case A.REGLAGES_MODIFIER: {
      return modifierReglagesEtat(etat, action.changements);
    }
    case A.SYNCHRO_APPLIQUER:
      // State chosen during a synchronisation (already migrated and validated): it is a
      // local change, saved and shown in the other tabs. Device-only settings are kept.
      if (!Array.isArray(action.grille) || !action.reglages) return etat;
      return { ...etat, grille: action.grille, reglages: action.reglages };
    case A.FUSIONNER:
      return avecGrille(etat, fusionner(etat.grille, action));
    case A.GRILLE_REMPLACER:
      return Array.isArray(action.grille) ? avecGrille(etat, action.grille) : etat;
    default:
      return etat;
  }
}
