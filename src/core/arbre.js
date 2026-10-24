/**
 * Pure helpers on the grid tree. A grid is an array of elements; a folder holds `items`
 * with the same shape. Every function returns new arrays along the modified path only.
 *
 * Definitions (used everywhere in the code and the comments):
 * - Level of a place: home = 0; content of a home folder = 1; content of a sub-folder = 2;
 *   content of a sub-sub-folder = 3.
 * - A folder put in a place of level n creates a place of level n + 1.
 * - PROFONDEUR_MAX = 3: folders may exist at levels 0, 1 and 2; never at level 3.
 * - Height of a folder: 1 + the largest height of its sub-folders (no sub-folder = 1;
 *   a site counts 0).
 * - A folder X may go in a place of level n when n + hauteur(X) <= PROFONDEUR_MAX.
 * - No loop: a folder X never goes into X itself nor into one of its descendants.
 */
import { PROFONDEUR_MAX } from "./constantes.js";

/** Safety bound for recursion: the depth is guaranteed by valider(), this is a backstop. */
const BORNE = 10;

/**
 * @returns {{ element: object, parent: object|null, index: number, chemin: object[] } | null}
 *   `parent` is the folder holding the element (null at the root), `chemin` the folders
 *   from the root down to that parent.
 */
export function trouver(grille, id, parent = null, chemin = []) {
  for (let index = 0; index < grille.length; index++) {
    const element = grille[index];
    if (element.id === id) return { element, parent, index, chemin };
    if (element.type === "dossier") {
      const r = trouver(element.items, id, element, [...chemin, element]);
      if (r) return r;
    }
  }
  return null;
}

/** Applies `f` to the item list of folder `parentId` (null = root). */
export function modifierListe(grille, parentId, f) {
  if (parentId == null) return f(grille);
  let trouve = false;
  const parcourir = (liste) =>
    liste.map((e) => {
      if (trouve || e.type !== "dossier") return e;
      if (e.id === parentId) {
        trouve = true;
        return { ...e, items: f(e.items) };
      }
      const items = parcourir(e.items);
      return items === e.items ? e : { ...e, items };
    });
  const resultat = parcourir(grille);
  return trouve ? resultat : grille;
}

const memesElements = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Replaces element `id` with `f(element)`. Unknown id: same grid returned. */
export function remplacer(grille, id, f) {
  let change = false;
  const parcourir = (liste) => {
    const resultat = liste.map((e) => {
      if (e.id === id) {
        const nouveau = f(e);
        if (nouveau !== e) change = true;
        return nouveau;
      }
      if (e.type === "dossier") {
        const items = parcourir(e.items);
        return items === e.items ? e : { ...e, items };
      }
      return e;
    });
    return memesElements(resultat, liste) ? liste : resultat;
  };
  const resultat = parcourir(grille);
  return change ? resultat : grille;
}

/** Removes element `id`. @returns {{ grille, element, parentId, index } | null} */
export function retirer(grille, id) {
  const r = trouver(grille, id);
  if (!r) return null;
  const parentId = r.parent?.id ?? null;
  const nouvelle = modifierListe(grille, parentId, (liste) => liste.filter((e) => e.id !== id));
  return { grille: nouvelle, element: r.element, parentId, index: r.index };
}

/** Inserts `element` in folder `parentId` (null = root) at `index` (clamped, default end). */
export function inserer(grille, element, parentId = null, index) {
  return modifierListe(grille, parentId, (liste) => {
    const copie = [...liste];
    const i = index == null ? copie.length : Math.max(0, Math.min(index, copie.length));
    copie.splice(i, 0, element);
    return copie;
  });
}

/** Depth-first iteration over every element. */
export function* parcourir(grille, profondeur = 0) {
  if (profondeur > BORNE) return;
  for (const e of grille) {
    yield e;
    if (e.type === "dossier") yield* parcourir(e.items, profondeur + 1);
  }
}

/** Every element with the folders leading to it: [{ element, chemin }] (search, V1.10). */
export function aplatir(grille, chemin = [], acc = []) {
  if (chemin.length > BORNE) return acc;
  for (const element of grille) {
    acc.push({ element, chemin });
    if (element.type === "dossier") aplatir(element.items, [...chemin, element], acc);
  }
  return acc;
}

/** Ancestor folders of `id`, from home down: [] at home, null when not found. */
export function cheminVers(grille, id) {
  const r = trouver(grille, id);
  return r ? r.chemin : null;
}

/** Level of the place inside `parentId` (null = home = 0). -1 when the folder is unknown. */
export function niveauEmplacement(grille, parentId) {
  if (parentId == null) return 0;
  const r = trouver(grille, parentId);
  if (r?.element.type !== "dossier") return -1;
  return r.chemin.length + 1;
}

/** 0 for a site, 1 + the largest height of the sub-folders for a folder. */
export function hauteur(element, profondeur = 0) {
  if (element?.type !== "dossier" || profondeur > BORNE) return 0;
  let max = 0;
  for (const e of element.items) max = Math.max(max, hauteur(e, profondeur + 1));
  return 1 + max;
}

/** True when `id` is inside folder `ancetreId` (at any depth). */
export function estDescendant(grille, ancetreId, id) {
  const chemin = cheminVers(grille, id);
  return !!chemin && chemin.some((d) => d.id === ancetreId);
}

/**
 * The single rule used by both the interface and the reducer.
 * @returns {{ ok: true } | { ok: false, raison: "BOUCLE" | "PROFONDEUR" | "INTROUVABLE" }}
 */
export function peutPlacer(grille, elementId, versParentId) {
  const r = trouver(grille, elementId);
  if (!r) return { ok: false, raison: "INTROUVABLE" };
  const niveau = niveauEmplacement(grille, versParentId);
  if (niveau < 0) return { ok: false, raison: "INTROUVABLE" };
  if (r.element.type !== "dossier") return { ok: true };
  if (versParentId === elementId || estDescendant(grille, elementId, versParentId)) {
    return { ok: false, raison: "BOUCLE" };
  }
  if (niveau + hauteur(r.element) > PROFONDEUR_MAX) return { ok: false, raison: "PROFONDEUR" };
  return { ok: true };
}

/** A new (empty) folder may be created in `parentId` when its level is below the maximum. */
export function peutCreerDossierDans(grille, parentId) {
  const niveau = niveauEmplacement(grille, parentId);
  return niveau >= 0 && niveau < PROFONDEUR_MAX;
}

/**
 * Moves element `id` to folder `versParentId` (null = root) at `versIndex`, the index the
 * element must have once moved. Returns the same grid when nothing changes (same place,
 * unknown id, unknown target folder, or a folder dropped into itself or a descendant).
 */
export function deplacer(grille, id, versParentId = null, versIndex) {
  const r = trouver(grille, id);
  if (!r) return grille;
  const deParentId = r.parent?.id ?? null;
  if (deParentId !== versParentId && !peutPlacer(grille, id, versParentId).ok) return grille;
  if (versParentId != null && trouver(grille, versParentId)?.element.type !== "dossier") {
    return grille;
  }
  const destination = versParentId == null ? grille : trouver(grille, versParentId).element.items;
  const longueurApres = destination.length - (deParentId === versParentId ? 1 : 0);
  const index = Math.max(0, Math.min(versIndex ?? longueurApres, longueurApres));
  if (deParentId === versParentId && index === r.index) return grille;
  const sans = retirer(grille, id).grille;
  return inserer(sans, r.element, versParentId, index);
}

/** The first `n` sites of a folder, depth-first (sub-folders themselves are skipped). */
export function apercuDossier(dossier, n = 4) {
  const sites = [];
  for (const e of parcourir(dossier.items)) {
    if (e.type === "site") sites.push(e);
    if (sites.length >= n) break;
  }
  return sites;
}

/** Total number of sites in a folder, all levels. */
export function compterSites(dossier) {
  let n = 0;
  for (const e of parcourir(dossier.items)) if (e.type === "site") n++;
  return n;
}

/** Every folder of the grid with its depth (1 = in the home grid), depth-first. */
export function listerDossiers(grille, niveau = 1, acc = []) {
  for (const e of grille) {
    if (e.type !== "dossier") continue;
    acc.push({ dossier: e, niveau });
    listerDossiers(e.items, niveau + 1, acc);
  }
  return acc;
}
