/**
 * What a restoration would change (V2.8), from element ids: `actuelle` is the grid now,
 * `cible` the grid of the backup. Pure.
 *
 * - ajoutes: in the backup, not here now (they come back);
 * - retires: here now, not in the backup (they disappear);
 * - deplaces: same id, different parent folder;
 * - renommes: same id, different title.
 */
import { aplatir } from "./arbre.js";

function index(grille) {
  const m = new Map();
  for (const { element, chemin } of aplatir(grille ?? [])) {
    m.set(element.id, { element, parentId: chemin.at(-1)?.id ?? null, chemin });
  }
  return m;
}

export function comparer(actuelle, cible) {
  const a = index(actuelle);
  const b = index(cible);
  const ajoutes = [];
  const retires = [];
  const deplaces = [];
  const renommes = [];
  for (const [id, x] of b) {
    const avant = a.get(id);
    if (!avant) {
      ajoutes.push(x.element);
      continue;
    }
    if (avant.parentId !== x.parentId)
      deplaces.push({ element: x.element, de: avant.chemin, vers: x.chemin });
    if (avant.element.titre !== x.element.titre) {
      renommes.push({ element: x.element, ancien: avant.element.titre, nouveau: x.element.titre });
    }
  }
  for (const [id, x] of a) if (!b.has(id)) retires.push(x.element);
  return { ajoutes, retires, deplaces, renommes };
}

/** "+3 sites, −12 sites, 4 déplacés, 1 renommé" (sites only for the +/− counts). */
export function resumer(d) {
  const sites = (l) => l.filter((e) => e.type === "site").length;
  const parties = [];
  const plus = sites(d.ajoutes);
  const moins = sites(d.retires);
  if (plus) parties.push(`+${plus} site${plus > 1 ? "s" : ""}`);
  if (moins) parties.push(`−${moins} site${moins > 1 ? "s" : ""}`);
  if (d.deplaces.length)
    parties.push(`${d.deplaces.length} déplacé${d.deplaces.length > 1 ? "s" : ""}`);
  if (d.renommes.length)
    parties.push(`${d.renommes.length} renommé${d.renommes.length > 1 ? "s" : ""}`);
  return parties.length ? parties.join(", ") : "Aucune différence";
}
