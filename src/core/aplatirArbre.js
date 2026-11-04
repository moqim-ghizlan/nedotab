/**
 * Flat, display-ready rows of the folder tree (selector T1). Pure: no DOM.
 * Placement rules come from peutPlacer (never duplicated here).
 */
import { peutPlacer, trouver } from "./arbre.js";

const norme = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * @param {object[]} grille
 * @param {{ ouverts?: Set<string|null>, filtre?: string, exclure?: string|null, actuel?: string|null }} o
 *   ouverts: ids of unfolded folders (home is always open); filtre: search text;
 *   exclure: id of the element being moved (checked with peutPlacer); actuel: its current parent.
 * @returns {{ id: string|null, titre: string, niveau: number, chemin: string[], aEnfants: boolean,
 *   ouvert: boolean, desactive: boolean, raison: string|null, correspond: boolean }[]}
 */
export function aplatirArbre(
  grille,
  { ouverts = new Set(), filtre = "", exclure = null, actuel } = {},
) {
  const q = norme(filtre).trim();
  const lignes = [];
  const verdict = (id) => {
    if (exclure != null && id === actuel) return { desactive: true, raison: "ACTUEL" };
    if (exclure == null) return { desactive: false, raison: null };
    const v = peutPlacer(grille, exclure, id);
    return v.ok ? { desactive: false, raison: null } : { desactive: true, raison: v.raison };
  };
  // A folder is kept by the filter when it matches or one descendant does.
  const garde = (d) =>
    !q || norme(d.titre).includes(q) || d.items.some((e) => e.type === "dossier" && garde(e));
  const visiter = (items, niveau, chemin) => {
    for (const d of items) {
      if (d.type !== "dossier" || !garde(d)) continue;
      const sous = d.items.filter((e) => e.type === "dossier" && garde(e));
      const ouvert = q ? sous.length > 0 : ouverts.has(d.id);
      lignes.push({
        id: d.id,
        titre: d.titre,
        niveau,
        chemin: [...chemin, d.titre],
        aEnfants: d.items.some((e) => e.type === "dossier"),
        ouvert,
        correspond: !!q && norme(d.titre).includes(q),
        ...verdict(d.id),
      });
      if (ouvert) visiter(d.items, niveau + 1, [...chemin, d.titre]);
    }
  };
  const aEnfantsRacine = grille.some((e) => e.type === "dossier");
  lignes.push({
    id: null,
    titre: "Accueil",
    niveau: 0,
    chemin: [],
    aEnfants: aEnfantsRacine,
    ouvert: true,
    correspond: false,
    ...verdict(null),
  });
  visiter(grille, 1, []);
  return lignes;
}

/** Ids of the folders to unfold so that `id` is visible (its ancestors). */
export function ouvertsPour(grille, id) {
  const r = id == null ? null : trouver(grille, id);
  return new Set(
    r ? [...r.chemin.map((d) => d.id), ...(r.element.type === "dossier" ? [id] : [])] : [],
  );
}

/** Titles from home to `id`: ["Accueil", "Travail", ...] with the id of each step. */
export function filAriane(grille, id) {
  const r = id == null ? null : trouver(grille, id);
  const etapes = [{ id: null, titre: "Accueil" }];
  if (r) for (const d of [...r.chemin, r.element]) etapes.push({ id: d.id, titre: d.titre });
  return etapes;
}
