/**
 * First contact between the local grid and the account's grid (V2.3). Pure functions.
 */
import { parcourir } from "./arbre.js";
import { valider } from "./migration.js";
import { cleUrl } from "./url.js";

/** Comparable form of a grid: no creation dates, keys sorted. */
function normaliser(valeur) {
  if (Array.isArray(valeur)) return valeur.map(normaliser);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.keys(valeur)
        .filter((k) => k !== "creeLe")
        .sort()
        .map((k) => [k, normaliser(valeur[k])]),
    );
  }
  return valeur;
}

export function grillesIdentiques(a, b) {
  return JSON.stringify(normaliser(a ?? [])) === JSON.stringify(normaliser(b ?? []));
}

export function compter(grille) {
  let sites = 0;
  let dossiers = 0;
  for (const e of parcourir(grille ?? [])) {
    if (e.type === "site") sites++;
    else if (e.type === "dossier") dossiers++;
  }
  return { sites, dossiers };
}

/** Removes the sites whose address is in `connues`, then the folders left empty by that. */
function sansDoublons(elements, connues) {
  const resultat = [];
  for (const e of elements) {
    if (e.type === "site") {
      if (!connues.has(cleUrl(e.url))) resultat.push(e);
    } else if (e.type === "dossier") {
      const items = sansDoublons(e.items, connues);
      if (items.length || e.items.length === 0) resultat.push({ ...e, items });
    }
  }
  return resultat;
}

/** Date as JJ/MM/AAAA. */
export function dateCourte(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Folder of imported elements: the sites of `grilleImportee` that are not already in
 * `grilleActuelle` (same address), ids kept unique, too deep folders flattened by valider()
 * (nothing is lost). Used by the first synchronisation (V2.3) and the file import (V2.10).
 * @returns {{ dossier: object|null, ajoutes: number, aplati: boolean }}
 */
export function dossierImporte(
  grilleActuelle,
  grilleImportee,
  { dossierId, titre, maintenant = Date.now() },
) {
  const connues = new Set(
    [...parcourir(grilleActuelle)].filter((e) => e.type === "site").map((e) => cleUrl(e.url)),
  );
  // Ids are kept unique: an imported element may share its id with a current one.
  const idsActuels = new Set([...parcourir(grilleActuelle)].map((e) => e.id));
  const renommer = (liste) =>
    liste.map((e) => {
      const id = idsActuels.has(e.id) ? `${e.id}~import` : e.id;
      return e.type === "dossier" ? { ...e, id, items: renommer(e.items) } : { ...e, id };
    });
  const importes = renommer(sansDoublons(grilleImportee, connues));
  const ajoutes = compter(importes).sites;
  if (ajoutes === 0) return { dossier: null, ajoutes: 0, aplati: false };
  let aplati = false;
  const { grille } = valider(
    {
      versionSchema: 2,
      grille: [{ id: dossierId, type: "dossier", titre, items: importes, creeLe: maintenant }],
    },
    () => {},
    () => (aplati = true),
  );
  return { dossier: grille[0], ajoutes, aplati };
}

/**
 * "Fusionner": the account's grid stays as it is; the local sites that are not already in
 * the account (same address) go into a folder "Importé de cet appareil — JJ/MM/AAAA" at
 * the end. Too deep folders are flattened by valider() (nothing is lost).
 * @returns {{ grille: object[], ajoutes: number, aplati: boolean }}
 */
export function fusionnerImport(
  grilleCompte,
  grilleLocale,
  { dossierId, maintenant = Date.now() },
) {
  const { dossier, ajoutes, aplati } = dossierImporte(grilleCompte, grilleLocale, {
    dossierId,
    titre: `Importé de cet appareil — ${dateCourte(maintenant)}`,
    maintenant,
  });
  if (!dossier) return { grille: grilleCompte, ajoutes: 0, aplati: false };
  return { grille: [...grilleCompte, dossier], ajoutes, aplati };
}
