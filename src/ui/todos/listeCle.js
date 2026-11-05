/**
 * Keeps the children of `parent` in line with `elements` WITHOUT recreating them: a line is
 * built once per id (stable key), updated in place, and moved only when it is not already at
 * its place. A snapshot therefore never interrupts the focus, a drag or a text being typed.
 *
 * @template T
 * @param {HTMLElement} parent
 * @param {Map<string, {li: HTMLElement}>} lignes lines already built (updated here)
 * @param {T[]} elements in the wanted order, each with an `id`
 * @param {(e: T) => {li: HTMLElement, maj: (e: T) => void}} creer
 */
export function reconcilier(parent, lignes, elements, creer) {
  const vus = new Set();
  let precedent = null;
  for (const e of elements) {
    vus.add(e.id);
    let ligne = lignes.get(e.id);
    if (!ligne) {
      ligne = creer(e);
      lignes.set(e.id, ligne);
    } else {
      ligne.maj(e);
    }
    const attendu = precedent ? precedent.nextElementSibling : parent.firstElementChild;
    if (attendu !== ligne.li) parent.insertBefore(ligne.li, attendu);
    precedent = ligne.li;
  }
  for (const [id, ligne] of lignes) {
    if (vus.has(id)) continue;
    ligne.li.remove();
    lignes.delete(id);
  }
}
