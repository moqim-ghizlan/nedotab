import Sortable from "sortablejs";
import { A } from "../core/actions.js";
import { trouver } from "../core/arbre.js";

const REDUIT = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Drag and drop on one grid level with SortableJS. The DOM is never the source of truth:
 * the gesture becomes an ELEMENT_DEPLACER action and the full re-render puts the DOM back in
 * line with the state. Renders requested during a drag are deferred until the drop.
 *
 * Holding an element over a tile or a breadcrumb segment is handled by `intention`
 * (see intentionDepot.js); the drop on such a target is passed to `deposer`.
 *
 * @param {HTMLElement} conteneur persistent list element (never recreated by the renderer)
 * @param {{ parentId?: () => string|null, rendre: () => void, intention?: object,
 *           deposer?: (id: string, cible: object) => void }} options parentId gives the level shown
 */
export function activerGlisser(
  store,
  conteneur,
  { parentId = () => null, rendre, intention, deposer },
) {
  let glisserEnCours = false;
  const suivre = (e) => intention?.suivre(e.clientX, e.clientY);

  const sortable = Sortable.create(conteneur, {
    animation: REDUIT ? 0 : 150,
    draggable: ".case--element",
    filter: ".case--ajout, .tuile-plus",
    preventOnFilter: false,
    ghostClass: "case--fantome",
    chosenClass: "case--choisie",
    dragClass: "case--glissee",
    forceFallback: true,
    fallbackTolerance: 4,
    // SortableJS swaps when the pointer enters the swap zone, which is centred on the target
    // by default: aiming at the centre of a tile (to drop into it) would reorder first.
    // Inverted swap puts that zone on the sides of the tile and keeps the centre free.
    invertSwap: true,
    invertedSwapThreshold: 0.7,
    onStart(evt) {
      glisserEnCours = true;
      document.body.classList.add("glisser-en-cours");
      intention?.demarrer(evt.item.querySelector("[data-id]")?.dataset.id);
      document.addEventListener("pointermove", suivre, true);
    },
    // While a drop target is active, or the dragged icon is well over a tile (it may become
    // one), SortableJS must not reorder: the target would move away under the icon.
    onMove: () => !intention?.actif() && !intention?.retient?.(),
    onEnd(evt) {
      document.body.classList.remove("glisser-en-cours");
      document.removeEventListener("pointermove", suivre, true);
      const id = evt.item.querySelector("[data-id]")?.dataset.id;
      const cible = intention?.terminer();
      if (id && cible) {
        deposer?.(id, cible);
      } else if (id && evt.oldDraggableIndex !== evt.newDraggableIndex) {
        store.envoyer({
          type: A.ELEMENT_DEPLACER,
          id,
          versParentId: parentId(),
          versIndex: evt.newDraggableIndex,
        });
      }
      // The click that ends a drag must not open the site. SortableJS also swallows the
      // next click after a drag; when the button is released over another element, no
      // click follows and the user's next real click would be lost: consume it now.
      setTimeout(() => {
        glisserEnCours = false;
        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }, 0);
      // Always re-render: Sortable moved DOM nodes, the state decides where they go.
      rendre();
    },
  });

  conteneur.addEventListener(
    "click",
    (e) => {
      if (glisserEnCours) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  return {
    /** Renders now, or after the drop when a drag is in progress. */
    demanderRendu() {
      if (!glisserEnCours) rendre();
    },
    enCours: () => glisserEnCours,
    detruire: () => sortable.destroy(),
  };
}

/**
 * Keyboard reordering on a focused tile: Alt+←/→ one cell, Alt+↑/↓ one row, Alt+Home/End.
 * Announces the new position in an aria-live region.
 */
export function activerDeplacementClavier(store, conteneur, { annoncer, colonnes }) {
  conteneur.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const tuile = e.target.closest(".tuile[data-id]");
    if (!tuile) return;
    const id = tuile.dataset.id;
    const r = trouver(store.lire().grille, id);
    if (!r) return;
    const liste = r.parent ? r.parent.items : store.lire().grille;
    const pas = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -colonnes(),
      ArrowDown: colonnes(),
      Home: -Infinity,
      End: Infinity,
    }[e.key];
    if (pas === undefined) return;
    e.preventDefault();
    const versIndex = Math.max(0, Math.min(liste.length - 1, r.index + pas));
    if (versIndex === r.index) return;
    store.envoyer({ type: A.ELEMENT_DEPLACER, id, versParentId: r.parent?.id ?? null, versIndex });
    requestAnimationFrame(() => {
      conteneur.querySelector(`.tuile[data-id="${CSS.escape(id)}"]`)?.focus();
    });
    annoncer(`${r.element.titre} déplacé en position ${versIndex + 1} sur ${liste.length}`);
  });
}
