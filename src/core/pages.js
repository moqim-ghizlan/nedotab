/**
 * Home grid shown as pages (V2.11). Pages are a display cut of the single ordered list:
 * nothing about pages is ever stored, so every device cuts the same list at its own size.
 */

/**
 * Tiles that fit without scrolling.
 * @returns {{ colonnes: number, lignes: number, parPage: number }}
 */
export function capacite({
  largeur,
  hauteur,
  largeurTuile,
  hauteurTuile,
  ecartX = 0,
  ecartY = 0,
  minimum = 4,
  colonnesForcees = null,
}) {
  const colonnes =
    colonnesForcees ?? Math.max(1, Math.floor((largeur + ecartX) / (largeurTuile + ecartX)));
  const lignes = Math.max(1, Math.floor((hauteur + ecartY) / (hauteurTuile + ecartY)));
  return { colonnes, lignes, parPage: Math.max(minimum, colonnes * lignes) };
}

/** Number of pages; the "+" tile takes the last cell, or opens one more page when full. */
export function nombrePages(nbElements, parPage, avecTuileAjout = true) {
  return Math.max(1, Math.ceil((nbElements + (avecTuileAjout ? 1 : 0)) / parPage));
}

/**
 * Cuts `elements` into pages: [{ elements, ajout }], `ajout` true on the page that shows
 * the "+" tile (the last one). An empty grid gives one page.
 */
export function decouper(elements, parPage, { avecTuileAjout = true } = {}) {
  const nb = nombrePages(elements.length, parPage, avecTuileAjout);
  return Array.from({ length: nb }, (_, i) => ({
    elements: elements.slice(i * parPage, (i + 1) * parPage),
    ajout: avecTuileAjout && i === nb - 1,
  }));
}

export const pageDeIndex = (indexGlobal, parPage) => Math.floor(indexGlobal / parPage);

export const indexGlobal = (page, indexDansPage, parPage) => page * parPage + indexDansPage;

/**
 * Final index in the whole list of an element dropped at `indexDansPage` of `pageCible`
 * (ELEMENT_DEPLACER's versIndex: position after the move). Coming from an earlier page, that
 * page has one element less while the drop is shown, so everything after it moved back by
 * one: the element keeps the neighbours it was dropped between.
 */
export function indexApresDepot({ pageSource, pageCible, indexDansPage, parPage }) {
  return indexGlobal(pageCible, indexDansPage, parPage) - (pageSource < pageCible ? 1 : 0);
}

export const borner = (page, nbPages) => Math.min(Math.max(0, page), Math.max(0, nbPages - 1));

/** After a size change, the page holding the first element the user was looking at. */
export function pageApresRedimensionnement({ pageActuelle, ancienParPage, nouveauParPage }) {
  return pageDeIndex(pageActuelle * ancienParPage, nouveauParPage);
}
