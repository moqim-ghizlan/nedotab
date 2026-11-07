import Sortable from "sortablejs";
import { A } from "../core/actions.js";
import { trouver } from "../core/arbre.js";
import { vibrer } from "./haptique.js";
import { EVENEMENT_EDITION, enEdition } from "./modeEdition.js";
import { DELAI_APPUI_LONG_MS, SEUIL_MOUVEMENT_PX, brancherAppuiLong } from "./appuiLong.js";
import { fermerMenuTactile } from "./menuTactile.js";
import { nettoyerGlisser } from "./nettoyageGlisser.js";

/** After a release, a drag still "in progress" this long later never got its end event (ms). */
export const DELAI_VERIF_FIN_MS = 600;
/** A drag that has not moved nor ended for this long is over (ms). */
export const INACTIVITE_MAX_MS = 30_000;

/** Instances (home grid, open folder) whose drag is running now: none cleans another one's copy. */
const actifs = new Set();

const REDUIT = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The dragged copy is made from the tile but shown in <body>, out of the grid whose rules
 * size it (icon size of the grid, zoom of the home pages): those are copied on the tile
 * itself before the copy is made, and removed when it is released.
 */
function figerApparence(caseEl) {
  const tuile = caseEl.querySelector(".tuile");
  if (!tuile) return;
  const style = getComputedStyle(tuile);
  caseEl.style.setProperty("--icone", style.getPropertyValue("--icone"));
  if (style.zoom && style.zoom !== "1") tuile.style.zoom = style.zoom;
}

function libererApparence(caseEl) {
  caseEl.style.removeProperty("--icone");
  caseEl.querySelector(".tuile")?.style.removeProperty("zoom");
}

/**
 * In a folder window (a modal <dialog>, in the top layer) a copy in <body> would be hidden
 * under the window. The copy itself goes to the top layer, above the window, as a popover:
 * there it is positioned against the screen whatever the window does (opening animation,
 * fading away when the icon is taken out of the folder).
 */
function placerCopieAuPremierPlan() {
  const copie = document.querySelector("body > .sortable-fallback");
  if (!copie || typeof copie.showPopover !== "function" || copie.matches(":popover-open")) return;
  if (!document.querySelector("dialog[open]:modal")) return;
  copie.popover = "manual";
  copie.showPopover();
}

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
 *           surFin?: (infos: { annule: boolean, id?: string }) => void, groupe?: string,
 *           sortie?: { active: () => boolean, deposer: (id: string) => void } }} options parentId
 *        gives the level shown; groupe: SortableJS group shared by the lists; sortie: the
 *        element was taken out of the folder window, it is dropped on the home grid
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
    sortie,
  },
) {
  let glisserEnCours = false;
  let annule = false;
  let generation = 0; // one more at each drag start: a late check ignores a newer drag
  let derniereActivite = 0;
  let aSynchroniser = false;
  let veilleur = null;
  const jeton = {};
  const suivre = (e) => {
    derniereActivite = Date.now();
    placerCopieAuPremierPlan();
    intention?.suivre(e.clientX, e.clientY);
  };
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
    filter: ".case--ajout, .tuile-plus, .tuile-retirer",
    preventOnFilter: false,
    ghostClass: "case--fantome",
    chosenClass: "case--choisie",
    dragClass: "case--glissee",
    forceFallback: true,
    fallbackTolerance: 4,
    // The dragged copy lives in <body>, not in the grid: the grid is a size container and
    // the pages slide with a transform, and both move a "fixed" element away from the
    // pointer (badly on iOS, where SortableJS positions the copy on its own). In <body> it
    // stays under the finger and the cursor, whatever page is shown.
    fallbackOnBody: true,
    onChoose: (evt) => figerApparence(evt.item),
    onUnchoose: (evt) => libererApparence(evt.item),
    // Finger (V3.5): the drag starts after a long press without moving (a quicker swipe
    // scrolls or turns the page), and the grid scrolls when the icon nears an edge.
    delay: enEdition() ? 0 : DELAI_APPUI_LONG_MS,
    delayOnTouchOnly: true,
    touchStartThreshold: SEUIL_MOUVEMENT_PX,
    scrollSensitivity: 60,
    scrollSpeed: 14,
    bubbleScroll: true,
    // SortableJS swaps when the pointer enters the swap zone, which is centred on the target
    // by default: aiming at the centre of a tile (to drop into it) would reorder first.
    // Inverted swap puts that zone on the sides of the tile and keeps the centre free.
    invertSwap: true,
    invertedSwapThreshold: 0.7,
    onStart(evt) {
      // A drag that starts after a long press: the action sheet of that press must be gone.
      fermerMenuTactile();
      vibrer(store);
      glisserEnCours = true;
      actifs.add(jeton);
      generation++;
      derniereActivite = Date.now();
      clearInterval(veilleur);
      veilleur = setInterval(() => {
        if (glisserEnCours && Date.now() - derniereActivite > INACTIVITE_MAX_MS) terminerDeForce();
      }, 5000);
      annule = false;
      document.body.classList.add("glisser-en-cours");
      requestAnimationFrame(placerCopieAuPremierPlan);
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
      vibrer(store);
      clearInterval(veilleur);
      actifs.delete(jeton);
      document.body.classList.remove("glisser-en-cours");
      document.removeEventListener("pointermove", suivre, true);
      document.removeEventListener("keydown", surTouche, true);
      const id = evt.item.querySelector("[data-id]")?.dataset.id;
      const cible = intention?.terminer();
      const vers = annule ? null : deplacement(evt);
      if (annule) {
        // Cancelled: the re-render below puts everything back.
      } else if (id && sortie?.active()) {
        sortie.deposer(id);
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
      if (aSynchroniser) {
        aSynchroniser = false;
        setTimeout(synchroniser, 0);
      }
      setTimeout(nettoyerGlisser, DELAI_VERIF_FIN_MS);
    },
  };

  /**
   * The drag was cut (touchcancel, system gesture, page hidden): SortableJS will not tell. End it
   * as a cancelled drag: stop the target timer and the listeners, tell the pages, clean the
   * orphan copy and render once from the state.
   */
  function terminerDeForce() {
    clearInterval(veilleur);
    actifs.delete(jeton);
    if (glisserEnCours) {
      glisserEnCours = false;
      document.removeEventListener("pointermove", suivre, true);
      document.removeEventListener("keydown", surTouche, true);
      try {
        intention?.terminer();
      } catch {
        /* nothing active */
      }
      surFin?.({ annule: true });
    }
    nettoyerGlisser();
    rendre();
    if (aSynchroniser) {
      aSynchroniser = false;
      synchroniser();
    }
  }

  // Each grid (home, open folder) has its own instance: the copy of a drag running in another
  // one is not ours to clean (a flag or a copy left by a cut drag still is).
  const autreGlisser = () => !glisserEnCours && actifs.size > 0;
  // After a release or a cancel: if the end event never came, finish the job. A newer drag is left alone.
  const verifierFin = () => {
    const g = generation;
    setTimeout(() => {
      if (g !== generation || autreGlisser()) return;
      if (glisserEnCours || document.querySelector("body > .sortable-fallback, body > .case--glissee")) terminerDeForce();
    }, DELAI_VERIF_FIN_MS);
  };
  // Whatever the user touches next, a copy left behind by a cut drag is removed (no drag is running).
  const surNouvelAppui = () => {
    if (!glisserEnCours && !autreGlisser()) nettoyerGlisser();
  };
  for (const type of ["pointerdown", "touchstart"]) document.addEventListener(type, surNouvelAppui, true);
  const surCache = () => {
    if (document.visibilityState === "hidden" && glisserEnCours) terminerDeForce();
  };
  const surFlou = () => glisserEnCours && terminerDeForce();
  for (const type of ["pointerup", "pointercancel", "touchend", "touchcancel"])
    document.addEventListener(type, verifierFin, true);
  document.addEventListener("visibilitychange", surCache);
  globalThis.addEventListener?.("blur", surFlou);

  // One SortableJS instance per list; lists added or removed by a render follow.
  const instances = new Map();
  const synchroniser = () => {
    // Never destroy an instance in the middle of a drag: its copy would be orphaned.
    if (glisserEnCours) {
      aSynchroniser = true;
      return;
    }
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

  // "Modifier la grille" (V3.6): an icon is dragged right away, without the long press.
  const surEdition = ({ detail }) => {
    options.delay = detail.actif ? 0 : DELAI_APPUI_LONG_MS;
    for (const instance of instances.values()) instance.option("delay", options.delay);
  };
  document.addEventListener(EVENEMENT_EDITION, surEdition);

  // A tile pressed but not dragged yet (SortableJS waits for a few pixels): a render now
  // would replace the tile under the pointer and the drag would be lost (a change from
  // another tab or device arriving at that moment). It waits for the release.
  let appui = false;
  let renduEnAttente = false;
  const finAppui = () => {
    if (!appui) return;
    appui = false;
    if (renduEnAttente && !glisserEnCours) rendre();
    renduEnAttente = false;
  };
  conteneur.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".case--element")) appui = true;
  });
  const debrancherAppuiLong = brancherAppuiLong(conteneur);
  for (const type of ["pointerup", "pointercancel"])
    document.addEventListener(type, finAppui, true);

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
    /** Renders now, or after the drop when a drag is in progress or a tile is pressed. */
    demanderRendu() {
      if (glisserEnCours) return;
      if (appui) renduEnAttente = true;
      else rendre();
    },
    enCours: () => glisserEnCours,
    synchroniser,
    /** Tests / safety: ends a cut drag and cleans what it left. */
    terminerDeForce,
    detruire: () => {
      clearInterval(veilleur);
      // Destroyed during its own drag (folder window closed): the other grids must not take it
      // for a drag still running, or they would never clean again.
      actifs.delete(jeton);
      for (const type of ["pointerup", "pointercancel", "touchend", "touchcancel"])
        document.removeEventListener(type, verifierFin, true);
      for (const type of ["pointerdown", "touchstart"]) document.removeEventListener(type, surNouvelAppui, true);
      document.removeEventListener("visibilitychange", surCache);
      globalThis.removeEventListener?.("blur", surFlou);
      debrancherAppuiLong();
      document.removeEventListener(EVENEMENT_EDITION, surEdition);
      for (const type of ["pointerup", "pointercancel"])
        document.removeEventListener(type, finAppui, true);
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
