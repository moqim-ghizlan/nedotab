/**
 * Home grid in pages, as in Infinity (V2.12). The grid stays one ordered list (folders,
 * search, sync and backups are unchanged); the synced settings add:
 * - grilleAccueil: { lignes, colonnes }, the same grid on every device (tiles shrink on a
 *   small screen);
 * - pagesAccueil: the number of home elements on each page, in list order. A page may hold
 *   fewer elements than it can: a tile moved to page 2 stays there even when page 1 has a
 *   free cell. Omitted while it is the plain cut (every page full except the last), so the
 *   settings saved before V2.12 are unchanged.
 * The reducer keeps pagesAccueil in line after every change of the home list (see
 * reconcilier): pages are contiguous segments of the list, never more than lignes ×
 * colonnes elements (the overflow goes to the next page), never empty.
 */

export const GRILLE_DEFAUT = { lignes: 4, colonnes: 8 };
export const LIGNES_MIN = 1;
export const LIGNES_MAX = 8;
export const COLONNES_MIN = 2;
export const COLONNES_MAX = 12;

const entierEntre = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

/** A valid { lignes, colonnes }, or null. */
export function validerGrilleAccueil(g) {
  if (!g || typeof g !== "object") return null;
  if (!entierEntre(g.lignes, LIGNES_MIN, LIGNES_MAX)) return null;
  if (!entierEntre(g.colonnes, COLONNES_MIN, COLONNES_MAX)) return null;
  return { lignes: g.lignes, colonnes: g.colonnes };
}

export const grilleAccueil = (reglages) =>
  validerGrilleAccueil(reglages?.grilleAccueil) ?? GRILLE_DEFAUT;

/** Elements per page. */
export const capaciteDe = (reglages) => {
  const g = grilleAccueil(reglages);
  return g.lignes * g.colonnes;
};

/** Plain cut: every page full except the last. An empty list has no page. */
export function comptesParDefaut(n, capacite) {
  const comptes = [];
  for (let reste = n; reste > 0; reste -= capacite) comptes.push(Math.min(capacite, reste));
  return comptes;
}

const memes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Valid page sizes for a list of `n` elements: whole numbers above 0, adding up to `n`
 * (missing elements go to the last page, extra ones are taken from the end), none above
 * `capacite` (the overflow goes to the next page).
 */
export function normaliserComptes(comptes, n, capacite) {
  const voulus = Array.isArray(comptes)
    ? comptes.filter((c) => Number.isInteger(c) && c > 0)
    : comptesParDefaut(n, capacite);
  let somme = voulus.reduce((s, c) => s + c, 0);
  const resultat = [...voulus];
  while (somme > n && resultat.length) {
    const retire = Math.min(resultat.at(-1), somme - n);
    resultat[resultat.length - 1] -= retire;
    somme -= retire;
    if (resultat.at(-1) === 0) resultat.pop();
  }
  if (somme < n) {
    if (resultat.length) resultat[resultat.length - 1] += n - somme;
    else resultat.push(n - somme);
  }
  return deborder(resultat, capacite);
}

/** A page above `capacite` gives its last elements to the next page, and so on. */
function deborder(comptes, capacite) {
  const resultat = [...comptes];
  for (let p = 0; p < resultat.length; p++) {
    if (resultat[p] <= capacite) continue;
    const surplus = resultat[p] - capacite;
    resultat[p] = capacite;
    if (p + 1 < resultat.length) resultat[p + 1] += surplus;
    else resultat.push(surplus);
  }
  return resultat;
}

/** pagesAccueil as stored: null (omitted) when it is the plain cut. */
export const comptesAStocker = (comptes, n, capacite) =>
  memes(comptes, comptesParDefaut(n, capacite)) ? null : comptes;

/** Page sizes of the home list of `etat` (valid, never stored as such). */
export const comptesDe = (etat) =>
  normaliserComptes(
    etat.reglages?.pagesAccueil ?? null,
    etat.grille.length,
    capaciteDe(etat.reglages),
  );

/** Cuts `liste` by page sizes. */
export function decouperParComptes(liste, comptes) {
  const pages = [];
  let debut = 0;
  for (const c of comptes) {
    pages.push(liste.slice(debut, debut + c));
    debut += c;
  }
  return pages;
}

/** Index in the whole list of position `indexDansPage` of `page` (the element `sansId` set aside). */
export function indexGlobalDansPages(liste, comptes, page, indexDansPage, sansId = null) {
  const pages = decouperParComptes(liste, comptes).map((p) => p.filter((e) => e.id !== sansId));
  let avant = 0;
  for (let p = 0; p < Math.min(page, pages.length); p++) avant += pages[p].length;
  const taille = pages[page]?.length ?? 0;
  return avant + Math.min(Math.max(0, indexDansPage ?? taille), taille);
}

/** { page, index } of the element at `indexGlobal`, or null. */
export function positionDans(comptes, indexGlobal) {
  let debut = 0;
  for (let page = 0; page < comptes.length; page++) {
    if (indexGlobal < debut + comptes[page]) return { page, index: indexGlobal - debut };
    debut += comptes[page];
  }
  return null;
}

/**
 * Pages after a change of the home list. Every element that was already there keeps its
 * page; a new one (added, put back, taken out of a folder) takes the page of the element it
 * replaces (the one that left the same spot), else of its neighbours (at the border of two
 * pages, the next one, except at the very end). `place` puts one element on a given page:
 * { id, page, index? } (page null: from its neighbours, as a new one; index: its position in
 * the page). Pages over capacity give their overflow to the next; empty ones disappear.
 * @returns {{ liste: object[], comptes: number[] }} the list in page order and the sizes
 */
export function reconcilier({ avant, comptesAvant, apres, capacite, place = null }) {
  const pageAvant = new Map();
  decouperParComptes(avant, comptesAvant).forEach((page, p) => {
    for (const e of page) pageAvant.set(e.id, p);
  });
  const indexAvant = new Map(avant.map((e, i) => [e.id, i]));
  const presents = new Set(apres.map((e) => e.id));
  const place_ = place && presents.has(place.id) ? place : null;
  const survivant = (e) => pageAvant.has(e.id) && e.id !== place_?.id;

  const pages = apres.map((e) => (survivant(e) ? pageAvant.get(e.id) : null));
  for (let i = 0; i < apres.length; i++) {
    if (pages[i] != null) continue;
    if (place_?.id === apres[i].id && place_.page != null) {
      pages[i] = place_.page;
      continue;
    }
    let p = i - 1;
    while (p >= 0 && !survivant(apres[p])) p--;
    let f = i + 1;
    while (f < apres.length && !survivant(apres[f])) f++;
    const precedent = p >= 0 ? apres[p] : null;
    const suivant = f < apres.length ? apres[f] : null;
    // The element that left this spot, if any: the new one takes its place.
    const de = precedent ? indexAvant.get(precedent.id) + 1 : 0;
    const a = suivant ? indexAvant.get(suivant.id) : avant.length;
    const parti = avant.slice(de, a).find((e) => !presents.has(e.id));
    if (parti) pages[i] = pageAvant.get(parti.id);
    else if (precedent && suivant)
      pages[i] =
        pageAvant.get(precedent.id) === pageAvant.get(suivant.id)
          ? pageAvant.get(precedent.id)
          : pageAvant.get(suivant.id);
    else if (precedent) pages[i] = pageAvant.get(precedent.id);
    else if (suivant) pages[i] = pageAvant.get(suivant.id);
    else pages[i] = 0;
  }

  // Group by page, in list order; the placed element at its index in its page.
  const groupes = new Map();
  apres.forEach((e, i) => {
    if (place_?.id === e.id && place_.index != null) return;
    if (!groupes.has(pages[i])) groupes.set(pages[i], []);
    groupes.get(pages[i]).push(e);
  });
  if (place_?.index != null) {
    const i = apres.findIndex((e) => e.id === place_.id);
    const page = pages[i];
    if (!groupes.has(page)) groupes.set(page, []);
    const g = groupes.get(page);
    g.splice(Math.min(Math.max(0, place_.index), g.length), 0, apres[i]);
  }
  const ordonnees = [...groupes.keys()].sort((x, y) => x - y).map((k) => groupes.get(k));
  const comptes = deborder(
    ordonnees.map((g) => g.length).filter((c) => c > 0),
    capacite,
  );
  return { liste: ordonnees.flat(), comptes };
}

export const borner = (page, nbPages) => Math.min(Math.max(0, page), Math.max(0, nbPages - 1));

/**
 * Grid of the home pages on a phone (V3.4): the synced grid (8 columns by default) makes
 * tiny tiles there, so a phone uses its own: 4 columns and 5 or 6 rows in portrait, 7 × 3
 * in landscape. `largeur` and `hauteur` are the screen's, in CSS px.
 */
export function grilleTelephone(largeur, hauteur) {
  if (largeur > hauteur) return { lignes: 3, colonnes: 7 };
  return { lignes: hauteur >= 800 ? 6 : 5, colonnes: 4 };
}

/**
 * Screens shown for the stored pages (V3.4): each stored page cut into screens of at most
 * `capacite` elements (Infinity: one screen per page, as on a computer). The stored pages
 * never change: a phone only shows them in smaller pieces.
 * @returns {{ page: number, debut: number, n: number }[]} stored page, position of the
 *   screen's first element in it, number of elements
 */
export function ecransDePages(comptes, capacite) {
  const ecrans = [];
  comptes.forEach((n, page) => {
    for (let debut = 0; debut < n; debut += capacite)
      ecrans.push({ page, debut, n: Math.min(capacite, n - debut) });
  });
  return ecrans;
}

/**
 * ELEMENT_DEPLACER's page and position for a drop from screen `de` to screen `vers` at
 * `index` (position among the other elements of that screen). A screen past the last one is
 * a new page. Moving forward within the same stored page, the element no longer counts
 * among those before it.
 */
export function deplacementEntreEcrans(ecrans, de, vers, index) {
  const cible = ecrans[vers];
  if (!cible) return { versPage: (ecrans.at(-1)?.page ?? -1) + 1, versIndex: index };
  const source = ecrans[de];
  const avant = source && source.page === cible.page && de < vers ? 1 : 0;
  return { versPage: cible.page, versIndex: cible.debut - avant + index };
}
