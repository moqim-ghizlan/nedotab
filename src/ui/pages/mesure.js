import { el } from "../dom.js";
import { rendreGrille } from "../grille.js";

export const DEBOUNCE_MS = 150;

/**
 * Size of the tiles of the home pages (V2.12). The grid has the same lignes × colonnes on
 * every device; when a cell is smaller than a tile, the tiles shrink (CSS zoom) so that the
 * page always shows all its rows without scrolling. `fenetre` is the clipping box of the
 * pages: its size comes from the layout around it, never from its content.
 *
 * The natural size of a tile is read from a sample tile, which only enters the page for the
 * time of a measure: it must never be found among the real tiles.
 */
export function creerMesure(fenetre, { grille }) {
  const temoin = el("ul", {
    class: "grille page-grille page-grille--temoin",
    "aria-hidden": "true",
    inert: true,
  });
  rendreGrille(temoin, [
    {
      id: "temoin",
      type: "site",
      titre: "Témoin",
      url: "https://temoin.invalid",
      // A letter badge: measuring never fetches an icon.
      icone: { type: "lettre", texte: "T", couleur: "#808080" },
      creeLe: 0,
    },
  ]);

  /** Sets --echelle-tuile on the pages for the current room and grid. */
  const appliquer = () => {
    const { lignes, colonnes } = grille();
    fenetre.append(temoin);
    const cs = getComputedStyle(temoin);
    const px = (v) => parseFloat(v) || 0;
    // Read while the sample is in the page (a detached element has no computed style).
    const case_ = temoin.firstElementChild.getBoundingClientRect();
    const largeurTuile = px(cs.getPropertyValue("--tuile-largeur-min")) || 96;
    const largeur =
      fenetre.clientWidth -
      px(cs.paddingLeft) -
      px(cs.paddingRight) -
      px(cs.columnGap) * (colonnes - 1);
    const hauteur =
      fenetre.clientHeight -
      px(cs.paddingTop) -
      px(cs.paddingBottom) -
      px(cs.rowGap) * (lignes - 1);
    temoin.remove();
    const echelle = Math.min(
      1,
      largeur / colonnes / largeurTuile,
      hauteur / lignes / (case_.height || 100),
    );
    fenetre.style.setProperty("--echelle-tuile", String(Math.max(0.3, echelle).toFixed(3)));
  };

  let minuteur = null;
  const observateur = new ResizeObserver(() => {
    clearTimeout(minuteur);
    minuteur = setTimeout(appliquer, DEBOUNCE_MS);
  });
  observateur.observe(fenetre);

  return {
    appliquer,
    detruire: () => {
      clearTimeout(minuteur);
      observateur.disconnect();
    },
  };
}
