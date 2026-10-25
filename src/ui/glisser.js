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
 * Home grid in pages (V2.11): one list per page, all in the same group. `listes()` gives
 * them (synchroniser() after each render) and `deplacement(evt)` turns the drop into the
 * fields of ELEMENT_DEPLACER (V2.12: the page and the position in it); `surDebut` /
 * `surFin` let the pages show their edge zones.
 *
 * Escape during a drag cancels it: nothing moves (`surFin` receives { annule: true }).
 * `surFin` also receives the id of the dragged element, before the render that follows.
 *
 * @param {HTMLElement} conteneur persistent element (never recreated by the renderer)
 * @param {{ parentId?: () => string|null, rendre: () => void, intention?: object,
 *           deposer?: (id: string, cible: object) => void, listes?: () => HTMLElement[],
 *           deplacement?: (evt: object) => object|null, surDebut?: () => void,
 *           surFin?: (infos: { annule: boolean, id?: string }) => void, groupe?: string }} options parentId
 *        gives the level shown; groupe: SortableJS group shared by the lists
 */
export function activerGlisser(
  store,
  conteneur,
  {
    parentId = () => null,
    rendre,
    intention,
    deposer,
    listes = () => [conteneur],
    deplacement = (evt) =>
      evt.oldDraggableIndex !== evt.newDraggableIndex ? { versIndex: evt.newDraggableIndex } : null,
    surDebut,
    surFin,
    groupe,
  },
) {
  let glisserEnCours = false;
  let annule = false;
  const suivre = (e) => intention?.suivre(e.clientX, e.clientY);
  // Escape: end the drag where it is, then nothing is applied.
  const surTouche = (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    annule = true;
    for (const type of ["pointerup", "mouseup"])
      document.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  };

  const options = {
    // The pages of the home grid share a group: a tile can go from one page to another.
    ...(groupe ? { group: groupe } : {}),
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
      annule = false;
      document.body.classList.add("glisser-en-cours");
      intention?.demarrer(evt.item.querySelector("[data-id]")?.dataset.id);
      document.addEventListener("pointermove", suivre, true);
      document.addEventListener("keydown", surTouche, true);
      surDebut?.();
    },
    // While a drop target is active, or the dragged icon is well over a tile (it may become
    // one), SortableJS must not reorder: the target would move away under the icon.
    onMove: () => !intention?.actif() && !intention?.retient?.(),
    // The "+" tile always stays last, also when SortableJS adds the tile at the end of a
    // list: only the tiles count for the drop, the "+" is only put back in its place.
    onChange(evt) {
      const plus = evt.to.querySelector(":scope > .case--ajout");
      if (plus?.nextElementSibling) evt.to.append(plus);
    },
    onEnd(evt) {
      document.body.classList.remove("glisser-en-cours");
      document.removeEventListener("pointermove", suivre, true);
      document.removeEventListener("keydown", surTouche, true);
      const id = evt.item.querySelector("[data-id]")?.dataset.id;
      const cible = intention?.terminer();
      const vers = annule ? null : deplacement(evt);
      if (annule) {
        // Cancelled: the re-render below puts everything back.
      } else if (id && cible) {
        deposer?.(id, cible);
      } else if (id && vers) {
        store.envoyer({ type: A.ELEMENT_DEPLACER, id, versParentId: parentId(), ...vers });
      }
      surFin?.({ annule, id });
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
  };

  // One SortableJS instance per list; lists added or removed by a render follow.
  const instances = new Map();
  const synchroniser = () => {
    const voulues = new Set(listes());
    for (const [liste, instance] of instances) {
      if (voulues.has(liste) && liste.isConnected) continue;
      instance.destroy();
      instances.delete(liste);
    }
    for (const liste of voulues) {
      if (!instances.has(liste)) instances.set(liste, Sortable.create(liste, options));
    }
  };
  synchroniser();

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
    synchroniser,
    detruire: () => {
      for (const instance of instances.values()) instance.destroy();
      instances.clear();
    },
  };
}

/**
 * Keyboard reordering on a focused tile: Alt+←/→ one cell, Alt+↑/↓ one row, Alt+Home/End.
 * Announces the new position in an aria-live region.
 */
export function activerDeplacementClavier(
  store,
  conteneur,
  { annoncer, colonnes, montrer = () => {}, deplacementClavier = null },
) {
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
    // Home pages (V2.12): the next cell across pages, given as a page and a position.
    const surPage = !r.parent && deplacementClavier ? deplacementClavier(id, e.key) : undefined;
    if (surPage === null) return;
    const versIndex = Math.max(0, Math.min(liste.length - 1, r.index + pas));
    if (!surPage && versIndex === r.index) return;
    store.envoyer({
      type: A.ELEMENT_DEPLACER,
      id,
      versParentId: r.parent?.id ?? null,
      ...(surPage ?? { versIndex }),
    });
    requestAnimationFrame(() => {
      // With pages, the page follows the tile when it leaves the one shown.
      const deplacee = conteneur.querySelector(`.tuile[data-id="${CSS.escape(id)}"]`);
      if (deplacee) montrer(deplacee);
      deplacee?.focus();
    });
    annoncer(`${r.element.titre} déplacé en position ${versIndex + 1} sur ${liste.length}`);
  });
}
