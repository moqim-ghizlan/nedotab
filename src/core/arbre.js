/**
 * Pure helpers on the grid tree. A grid is an array of elements; a folder holds `items`
 * with the same shape. Every function returns new arrays along the modified path only.
 */

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
export function* parcourir(grille) {
  for (const e of grille) {
    yield e;
    if (e.type === "dossier") yield* parcourir(e.items);
  }
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
  if (versParentId != null) {
    if (versParentId === id) return grille;
    const cible = trouver(grille, versParentId);
    if (!cible || cible.element.type !== "dossier") return grille;
    if (r.element.type === "dossier" && cible.chemin.some((d) => d.id === id)) return grille;
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
