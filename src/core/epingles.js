/**
 * Home pins (7.2): up to 10 sites or folders chosen by the user, shown as a vertical list on the
 * home page (large screens). Pure functions, no DOM.
 *
 * A pinned element stays where it is in the grid tree (so sync, search, backups and moves keep
 * working) and carries `epingleAccueil`: its rank in the list, 1..MAX_EPINGLES. The grid hides
 * it, which is why unpinning puts it back exactly where it was. This is NOT `epingle`
 * (V4.21, "Les plus utilisés"): the two never interact.
 */
import { aplatir, remplacer, trouver } from "./arbre.js";

export const MAX_EPINGLES = 10;

const rangValide = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_EPINGLES;

/** The pinned elements, in list order: [{ element, chemin }]. */
export function listeEpingles(grille) {
  return aplatir(grille ?? [])
    .filter((x) => rangValide(x.element.epingleAccueil))
    .sort((a, b) => a.element.epingleAccueil - b.element.epingleAccueil);
}

export const estEpingle = (element) => rangValide(element?.epingleAccueil);

/** @returns {{ ok: true } | { ok: false, raison: "inconnu"|"deja"|"plein" }} */
export function peutEpingler(grille, id) {
  const r = trouver(grille, id);
  if (!r) return { ok: false, raison: "inconnu" };
  if (estEpingle(r.element)) return { ok: false, raison: "deja" };
  if (listeEpingles(grille).length >= MAX_EPINGLES) return { ok: false, raison: "plein" };
  return { ok: true };
}

export const MESSAGE_PLEIN = `${MAX_EPINGLES} éléments épinglés au maximum.`;

/** Pins `id` at the end of the list. Same grid when it cannot be pinned. */
export function epingler(grille, id) {
  if (!peutEpingler(grille, id).ok) return grille;
  // Ranks are closed up again each time: a deleted pin may have left a gap.
  const ids = listeEpingles(grille).map((x) => x.element.id);
  const avec = remplacer(grille, id, (e) => ({ ...e, epingleAccueil: MAX_EPINGLES }));
  return renumeroter(avec, [...ids, id]);
}

/** Unpins `id` and closes the gap in the ranks. */
export function desepingler(grille, id) {
  const r = trouver(grille, id);
  if (!r || !estEpingle(r.element)) return grille;
  const ids = listeEpingles(grille)
    .map((x) => x.element.id)
    .filter((x) => x !== id);
  const sans = remplacer(grille, id, (e) => {
    const copie = { ...e };
    delete copie.epingleAccueil;
    return copie;
  });
  return renumeroter(sans, ids);
}

/** Moves the pin `id` to position `versIndex` of the list (0 = first). */
export function deplacerEpingle(grille, id, versIndex) {
  const ids = listeEpingles(grille).map((x) => x.element.id);
  const de = ids.indexOf(id);
  if (de < 0) return grille;
  const vers = Math.max(0, Math.min(ids.length - 1, Number.isInteger(versIndex) ? versIndex : de));
  if (vers === de) return grille;
  ids.splice(de, 1);
  ids.splice(vers, 0, id);
  return renumeroter(grille, ids);
}

function renumeroter(grille, ids) {
  let suivante = grille;
  ids.forEach((id, i) => {
    suivante = remplacer(suivante, id, (e) => (e.epingleAccueil === i + 1 ? e : { ...e, epingleAccueil: i + 1 }));
  });
  return suivante;
}

/**
 * Makes the pins of a loaded grid valid: ranks that are not 1..10 are dropped, ties and gaps
 * are closed in a stable order, and only the first MAX_EPINGLES stay. Idempotent.
 */
export function normaliserEpingles(grille) {
  const tous = aplatir(grille ?? []);
  const avecRang = tous.filter((x) => "epingleAccueil" in x.element);
  if (avecRang.length === 0) return grille;
  const valides = avecRang
    .map((x, ordre) => ({ id: x.element.id, rang: x.element.epingleAccueil, ordre }))
    .filter((x) => rangValide(x.rang))
    .sort((a, b) => a.rang - b.rang || a.ordre - b.ordre)
    .slice(0, MAX_EPINGLES)
    .map((x) => x.id);
  const gardes = new Set(valides);
  let suivante = grille;
  for (const { element } of avecRang) {
    if (gardes.has(element.id)) continue;
    suivante = remplacer(suivante, element.id, (e) => {
      const copie = { ...e };
      delete copie.epingleAccueil;
      return copie;
    });
  }
  return renumeroter(suivante, valides);
}
