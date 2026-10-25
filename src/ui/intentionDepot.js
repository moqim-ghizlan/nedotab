/**
 * "Drop into" intention during a drag, kept independent from SortableJS (so that a
 * pointer-events implementation, or touch in V3.5, can reuse it).
 *
 * - Holding the dragged icon over a tile's icon for DELAI_FUSION_MS makes it the drop target
 *   (folder: go inside; site: create a folder with both). What counts is what the user sees:
 *   the dragged icon, not the exact pointer position (which may be on a corner of it). The
 *   target's capture zone is its icon plus MARGE_CAPTURE on each side; the tile whose zone
 *   holds most of the dragged icon (at least SEUIL_RECOUVREMENT) becomes the candidate, and
 *   stays the target while at least SEUIL_MAINTIEN remains in its zone.
 * - Once the dragged icon has stayed well inside a zone (SEUIL_RETENUE) for DELAI_RETENUE_MS
 *   (the user is aiming), the grid stops reordering: otherwise the target would move away
 *   before the delay ends. Passing over tiles quickly still reorders.
 * - Hovering a breadcrumb segment for DELAI_ARIANE_MS makes that level the target.
 * Leaving the zone cancels the target and the timer. The state is never changed here: the
 * caller acts on the target returned by terminer(), checked at the exact drop position.
 */
export const DELAI_FUSION_MS = 500;
export const DELAI_ARIANE_MS = 400;
export const MARGE_CAPTURE = 0.25;
export const SEUIL_RECOUVREMENT = 0.3;
export const SEUIL_MAINTIEN = 0.15;
export const SEUIL_RETENUE = 0.5;
export const DELAI_RETENUE_MS = 200;

/** Capture zone of an icon: its rectangle grown by `marge` of its size on each side. */
export function zoneCapture(rect, marge = MARGE_CAPTURE) {
  const mx = rect.width * marge;
  const my = rect.height * marge;
  return {
    left: rect.left - mx,
    top: rect.top - my,
    right: rect.right + mx,
    bottom: rect.bottom + my,
    width: rect.width + 2 * mx,
    height: rect.height + 2 * my,
  };
}

/** Share of rectangle `b` covered by rectangle `a` (0 to 1). */
export function recouvrement(a, b) {
  const largeur = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const hauteur = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (largeur <= 0 || hauteur <= 0 || b.width <= 0 || b.height <= 0) return 0;
  return (largeur * hauteur) / (b.width * b.height);
}

/** True when (x, y) is in the central part of `rect` (`ratio` of its width and height). */
export function dansZoneCentrale(rect, x, y, ratio = 0.5) {
  const mx = (rect.width * (1 - ratio)) / 2;
  const my = (rect.height * (1 - ratio)) / 2;
  return x >= rect.left + mx && x <= rect.right - mx && y >= rect.top + my && y <= rect.bottom - my;
}

/**
 * @param {{ evaluer: (cible: {type: "fusion"|"niveau", id: string|null}) => {ok: boolean, raison?: string},
 *           racine?: Document, exclure?: (x: number, y: number) => boolean }} options exclure:
 *        positions where no target is taken (edge zones of the home pages)
 */
export function creerIntentionDepot({
  evaluer,
  racine = document,
  horloge = () => Date.now(),
  exclure = () => false,
}) {
  let sourceId = null;
  let candidat = null; // { type, id, el }
  let candidatDepuis = 0;
  let active = null; // { type, id, el, ok, raison }
  let minuteur = null;
  let dernier = null;
  let sousLePointeur = null; // target computed at the last pointer move

  const effacer = () => {
    clearTimeout(minuteur);
    minuteur = null;
    candidat = null;
    if (active) {
      active.el.classList.remove("cible--fusion", "cible--refusee", "cible--niveau");
      active = null;
    }
  };

  const ignore = (noeud) => noeud.closest?.(".case--glissee, .sortable-fallback");

  /** Visible tile whose capture zone holds most of the dragged icon (`fantome`), or null. */
  const tuileRecouverte = (fantome, seuilActif) => {
    let meilleure = null;
    for (const tuile of racine.querySelectorAll(".case--element .tuile[data-id]")) {
      if (tuile.dataset.id === sourceId || ignore(tuile)) continue;
      const icone = (tuile.querySelector(".tuile-icone") ?? tuile).getBoundingClientRect();
      const part = recouvrement(zoneCapture(icone), fantome);
      const seuil = active?.el === tuile ? seuilActif : SEUIL_RECOUVREMENT;
      if (part < seuil || part <= (meilleure?.part ?? 0)) continue;
      // Hidden tiles (home grid behind an open folder window) do not count.
      const x = icone.left + icone.width / 2;
      const y = icone.top + icone.height / 2;
      const dessus = racine.elementsFromPoint(x, y).find((n) => !ignore(n));
      if (dessus?.closest?.(".tuile[data-id]") !== tuile) continue;
      meilleure = { part, tuile };
    }
    return (
      meilleure && {
        type: "fusion",
        id: meilleure.tuile.dataset.id,
        el: meilleure.tuile,
        part: meilleure.part,
      }
    );
  };

  /** Target under the pointer, or null (the dragged element itself is ignored). */
  const cibleSous = (x, y) => {
    const noeuds = racine.elementsFromPoint(x, y);
    for (const noeud of noeuds) {
      if (ignore(noeud)) continue;
      const segment = noeud.closest?.(".ariane-segment[data-cible]");
      if (segment) return { type: "niveau", id: segment.dataset.cible || null, el: segment };
    }
    // The dragged icon (SortableJS fallback) when there is one: what the user sees.
    const fantome = racine.querySelector(".sortable-fallback .tuile-icone");
    if (fantome) return tuileRecouverte(fantome.getBoundingClientRect(), SEUIL_MAINTIEN);
    for (const noeud of noeuds) {
      if (ignore(noeud)) continue;
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
      // A page edge zone (V2.11) has priority over the tiles under it.
      const c = exclure(x, y) ? null : cibleSous(x, y);
      sousLePointeur = c;
      if (meme(c, active) || meme(c, candidat)) return;
      effacer();
      if (!c) return;
      candidat = c;
      candidatDepuis = horloge();
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
    /** The dragged icon is well over a tile: do not reorder (the target would move away). */
    retient: () =>
      !!candidat &&
      meme(sousLePointeur, candidat) &&
      (sousLePointeur.part ?? 0) >= SEUIL_RETENUE &&
      horloge() - candidatDepuis >= DELAI_RETENUE_MS,
    /** Ends the drag; returns the active target still under the pointer, or null. */
    terminer() {
      let resultat = null;
      if (active && dernier) {
        // The target seen at the last move: when the button is released SortableJS has
        // already removed the dragged icon, the position cannot be measured again.
        if (meme(sousLePointeur, active))
          resultat = { type: active.type, id: active.id, ok: active.ok, raison: active.raison };
      }
      effacer();
      sourceId = null;
      dernier = null;
      sousLePointeur = null;
      return resultat;
    },
  };
}
