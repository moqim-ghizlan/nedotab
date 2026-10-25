import { capacite } from "../../core/pages.js";
import { el } from "../dom.js";
import { rendreGrille } from "../grille.js";

export const DEBOUNCE_MS = 150;

/**
 * Room for the home pages (V2.11). `fenetre` is the clipping box of the pages: its size
 * comes from the layout around it (flex), never from its content, so measuring it cannot
 * loop. The size of a tile is read from a hidden sample tile and from the CSS, never
 * duplicated here. The sample only enters the page for the time of a measure: it must never
 * be found among the real tiles (selectors, keyboard, drop targets).
 */
export function creerMesure(fenetre, { surChangement }) {
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

  const mesurer = () => {
    fenetre.append(temoin);
    const cs = getComputedStyle(temoin);
    const px = (v) => parseFloat(v) || 0;
    const boite = fenetre.getBoundingClientRect();
    const forcees = Number(document.documentElement.dataset.colonnes) || null;
    const resultat = capacite({
      largeur: boite.width - px(cs.paddingLeft) - px(cs.paddingRight),
      hauteur: boite.height - px(cs.paddingTop) - px(cs.paddingBottom),
      largeurTuile: px(cs.getPropertyValue("--tuile-largeur-min")) || 96,
      hauteurTuile: temoin.firstElementChild?.getBoundingClientRect().height || 100,
      ecartX: px(cs.columnGap),
      ecartY: px(cs.rowGap),
      colonnesForcees: forcees,
    });
    temoin.remove();
    return resultat;
  };

  let minuteur = null;
  let derniere = null;
  const observateur = new ResizeObserver(() => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      const taille = `${fenetre.clientWidth}×${fenetre.clientHeight}`;
      if (taille === derniere) return;
      derniere = taille;
      surChangement();
    }, DEBOUNCE_MS);
  });
  observateur.observe(fenetre);

  return {
    mesurer,
    detruire: () => {
      clearTimeout(minuteur);
      observateur.disconnect();
    },
  };
}
