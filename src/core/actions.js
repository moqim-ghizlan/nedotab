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
import {
  capaciteDe,
  comptesAStocker,
  comptesDe,
  indexGlobalDansPages,
  normaliserComptes,
  positionDans,
  reconcilier,
} from "./pages.js";
import { FONDS_MAX, modifierReglagesEtat, validerEntreeFond } from "./reglages.js";

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
  FOND_AJOUTER: "FOND_AJOUTER",
  FOND_SUPPRIMER: "FOND_SUPPRIMER",
  GRILLE_RESTAURER: "GRILLE_RESTAURER",
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

/**
 * The reducer. Every change of the home list also updates the home pages (V2.12, see
 * pages.js): ELEMENT_DEPLACER may give `versPage` (then `versIndex` is the position in that
 * page), FUSIONNER keeps the new folder on the page of its target, ELEMENT_RESTAURER may
 * give the `page` the element was on, GRILLE_REMPLACER may give the `pages` to put back.
 */
export function reduire(etat, action) {
  const { action: effective, place } = preparerPages(etat, action);
  const suivant = reduireBase(etat, effective);
  // A move may change only the page (the last tile of a page put first on the next one).
  if (suivant === etat && place?.page == null) return etat;
  return avecPages(etat, suivant, effective, place);
}

const racine = (r) => !!r && !r.parent;

/** The action as the base reducer understands it, and which element goes on which page. */
function preparerPages(etat, action) {
  if (action.type === A.ELEMENT_DEPLACER && (action.versParentId ?? null) === null) {
    if (action.versPage == null) return { action, place: { id: action.id, page: null } };
    const versIndex = indexGlobalDansPages(
      etat.grille,
      comptesDe(etat),
      action.versPage,
      action.versIndex,
      action.id,
    );
    return {
      action: { ...action, versIndex },
      place: { id: action.id, page: action.versPage, index: action.versIndex },
    };
  }
  if (action.type === A.FUSIONNER && action.nouveauDossierId) {
    const r = trouver(etat.grille, action.cibleId);
    if (racine(r)) {
      const page = positionDans(comptesDe(etat), r.index)?.page ?? null;
      return { action, place: { id: action.nouveauDossierId, page } };
    }
  }
  if (
    action.type === A.ELEMENT_RESTAURER &&
    action.page != null &&
    (action.parentId ?? null) === null
  ) {
    return { action, place: { id: action.element?.id, page: action.page } };
  }
  return { action, place: null };
}

/** Actions that bring their own settings: their pages are only checked. */
const AVEC_REGLAGES = new Set([A.CHARGER, A.GRILLE_RESTAURER, A.SYNCHRO_APPLIQUER]);

const memesComptes = (a, b) =>
  a === b ||
  (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));

function avecPages(etat, suivant, action, place) {
  if (!suivant.reglages || !Array.isArray(suivant.grille)) return suivant;
  const capacite = capaciteDe(suivant.reglages);
  let liste = suivant.grille;
  let comptes;
  if (AVEC_REGLAGES.has(action.type) || (action.type === A.GRILLE_REMPLACER && action.pages)) {
    const voulus =
      action.type === A.GRILLE_REMPLACER ? action.pages : suivant.reglages.pagesAccueil;
    comptes = normaliserComptes(voulus ?? null, liste.length, capacite);
  } else {
    const memeListe = suivant.grille === etat.grille && capaciteDe(etat.reglages) === capacite;
    if (memeListe && place?.page == null) return suivant;
    ({ liste, comptes } = reconcilier({
      avant: etat.grille,
      comptesAvant: comptesDe(etat),
      apres: suivant.grille,
      capacite,
      place,
    }));
  }
  const grille =
    liste.length === suivant.grille.length && liste.every((e, i) => e === suivant.grille[i])
      ? suivant.grille
      : liste;
  const stocke = comptesAStocker(comptes, liste.length, capacite);
  let reglages = suivant.reglages;
  if (!memesComptes(stocke, reglages.pagesAccueil ?? null)) {
    reglages = { ...reglages };
    if (stocke) reglages.pagesAccueil = stocke;
    else delete reglages.pagesAccueil;
  }
  if (grille === suivant.grille && reglages === suivant.reglages) return suivant;
  return { ...suivant, grille, reglages };
}

function reduireBase(etat, action) {
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
    case A.ELEMENT_DEPLACER: {
      const vers = action.versParentId ?? null;
      const r = trouver(etat.grille, action.id);
      // Target folder deleted elsewhere (replay, V2.9): to the end of its own place.
      if (r && vers != null && trouver(etat.grille, vers)?.element.type !== "dossier") {
        return avecGrille(etat, deplacer(etat.grille, action.id, r.parent?.id ?? null));
      }
      return avecGrille(etat, deplacer(etat.grille, action.id, vers, action.versIndex));
    }
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
    case A.FOND_AJOUTER: {
      // Added only once the file is in Storage. At most 10 pictures.
      const entree = validerEntreeFond(action.fond);
      const fonds = etat.reglages.fonds ?? [];
      if (!entree || fonds.length >= FONDS_MAX || fonds.some((f) => f.id === entree.id))
        return etat;
      const avecFond = { ...etat, reglages: { ...etat.reglages, fonds: [...fonds, entree] } };
      if (!action.activer) return avecFond;
      return modifierReglagesEtat(avecFond, {
        fond: { type: "image", id: entree.id, voile: action.voile ?? 0.25, flou: action.flou ?? 0 },
      });
    }
    case A.FOND_SUPPRIMER: {
      const fonds = etat.reglages.fonds ?? [];
      if (!fonds.some((f) => f.id === action.id)) return etat;
      const fond = etat.reglages.fond?.id === action.id ? { type: "aucun" } : etat.reglages.fond;
      return {
        ...etat,
        reglages: { ...etat.reglages, fond, fonds: fonds.filter((f) => f.id !== action.id) },
      };
    }
    case A.GRILLE_RESTAURER:
      // A backup put back (already migrated and validated): grid and synced settings.
      if (!Array.isArray(action.etat?.grille) || !action.etat.reglages) return etat;
      return { ...etat, grille: action.etat.grille, reglages: action.etat.reglages };
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
