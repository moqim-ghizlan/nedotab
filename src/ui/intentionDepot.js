/**
 * "Drop into" intention during a drag, kept independent from SortableJS (so that a
 * pointer-events implementation, or touch in V3.5, can reuse it).
 *
 * - Hovering the central zone of a tile for DELAI_FUSION_MS makes it the drop target
 *   (folder: go inside; site: create a folder with both).
 * - Hovering a breadcrumb segment for DELAI_ARIANE_MS makes that level the target.
 * Leaving the zone cancels the target and the timer. The state is never changed here: the
 * caller acts on the target returned by terminer(), checked at the exact drop position.
 */
export const DELAI_FUSION_MS = 500;
export const DELAI_ARIANE_MS = 400;

/** True when (x, y) is in the central part of `rect` (`ratio` of its width and height). */
export function dansZoneCentrale(rect, x, y, ratio = 0.5) {
  const mx = (rect.width * (1 - ratio)) / 2;
  const my = (rect.height * (1 - ratio)) / 2;
  return x >= rect.left + mx && x <= rect.right - mx && y >= rect.top + my && y <= rect.bottom - my;
}

/**
 * @param {{ evaluer: (cible: {type: "fusion"|"niveau", id: string|null}) => {ok: boolean, raison?: string},
 *           racine?: Document }} options
 */
export function creerIntentionDepot({ evaluer, racine = document }) {
  let sourceId = null;
  let candidat = null; // { type, id, el }
  let active = null; // { type, id, el, ok, raison }
  let minuteur = null;
  let dernier = null;

  const effacer = () => {
    clearTimeout(minuteur);
    minuteur = null;
    candidat = null;
    if (active) {
      active.el.classList.remove("cible--fusion", "cible--refusee", "cible--niveau");
      active = null;
    }
  };

  /** Target under the pointer, or null (the dragged element itself is ignored). */
  const cibleSous = (x, y) => {
    for (const noeud of racine.elementsFromPoint(x, y)) {
      if (noeud.closest?.(".case--glissee, .sortable-fallback")) continue;
      const segment = noeud.closest?.(".ariane-segment[data-cible]");
      if (segment) return { type: "niveau", id: segment.dataset.cible || null, el: segment };
      const tuile = noeud.closest?.(".case--element .tuile[data-id]");
      if (tuile) {
        if (tuile.dataset.id === sourceId) return null;
        const icone = tuile.querySelector(".tuile-icone") ?? tuile;
        if (!dansZoneCentrale(icone.getBoundingClientRect(), x, y)) return null;
        return { type: "fusion", id: tuile.dataset.id, el: tuile };
      }
    }
    return null;
  };

  const meme = (a, b) => a && b && a.type === b.type && a.id === b.id;

  const activer = (c) => {
    const verdict = evaluer(c);
    if (verdict.ignorer) return;
    active = { ...c, ok: verdict.ok, raison: verdict.raison };
    c.el.classList.add(
      verdict.ok ? (c.type === "niveau" ? "cible--niveau" : "cible--fusion") : "cible--refusee",
    );
  };

  return {
    demarrer(id) {
      sourceId = id;
      effacer();
    },
    /** Follows the pointer; starts or cancels the hover timer. */
    suivre(x, y) {
      if (sourceId == null) return;
      dernier = { x, y };
      const c = cibleSous(x, y);
      if (meme(c, active) || meme(c, candidat)) return;
      effacer();
      if (!c) return;
      candidat = c;
      minuteur = setTimeout(
        () => {
          minuteur = null;
          if (meme(candidat, c)) activer(c);
        },
        c.type === "niveau" ? DELAI_ARIANE_MS : DELAI_FUSION_MS,
      );
    },
    /** A drop target is active: SortableJS must not reorder meanwhile. */
    actif: () => !!active,
    /** Ends the drag; returns the active target still under the pointer, or null. */
    terminer() {
      let resultat = null;
      if (active && dernier) {
        const c = cibleSous(dernier.x, dernier.y);
        if (meme(c, active))
          resultat = { type: active.type, id: active.id, ok: active.ok, raison: active.raison };
      }
      effacer();
      sourceId = null;
      dernier = null;
      return resultat;
    },
  };
}
