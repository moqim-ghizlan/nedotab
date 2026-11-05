/**
 * Search, filters and sorts of the todos (V6.5). Pure. The search works on the todos ALREADY
 * loaded (never a read of the whole database), without accents or case, on the title and the
 * description; the normalisation is the one of the sites search (`normaliser`).
 */
import { compareJours, statutEcheance } from "./echeances.js";
import { normaliser } from "./recherche.js";
import { trierTodos } from "./todos.js";

export const FILTRES = [
  { id: "tous", libelle: "Tous" },
  { id: "afaire", libelle: "À faire" },
  { id: "faits", libelle: "Faits" },
  { id: "retard", libelle: "En retard" },
  { id: "sansEcheance", libelle: "Sans échéance" },
];

export const TRIS = [
  { id: "manuel", libelle: "Ordre manuel" },
  { id: "echeance", libelle: "Échéance" },
  { id: "creation", libelle: "Création" },
  { id: "modification", libelle: "Dernière modification" },
];

/** Delay of the search while typing. */
export const DELAI_RECHERCHE_MS = 150;

/** The text of each todo, normalised once: rebuilt when the list changes, not at each key. */
export function indexerTodos(todos) {
  return new Map(todos.map((t) => [t.id, normaliser(`${t.titre}\n${t.description}`)]));
}

/**
 * An indexer that remembers the normalised text of each todo: a snapshot that changes one todo
 * normalises one text, not five hundred.
 */
export function creerIndexeur() {
  const cache = new Map();
  return (todos) => {
    const index = new Map();
    for (const t of todos) {
      const c = cache.get(t.id);
      if (c && c.titre === t.titre && c.description === t.description) {
        index.set(t.id, c.texte);
      } else {
        const texte = normaliser(`${t.titre}
${t.description}`);
        cache.set(t.id, { titre: t.titre, description: t.description, texte });
        index.set(t.id, texte);
      }
    }
    return index;
  };
}

/** The words of a query, normalised. */
export const motsDeRequete = (requete) => normaliser(requete).split(" ").filter(Boolean);

/** Ids of the todos holding EVERY word of the query (partial words match). */
export function rechercherTodos(index, requete) {
  const mots = motsDeRequete(requete);
  if (mots.length === 0) return null; // no query: everything matches
  const ids = new Set();
  for (const [id, texte] of index) if (mots.every((m) => texte.includes(m))) ids.add(id);
  return ids;
}

/** @param {"tous"|"afaire"|"faits"|"retard"|"sansEcheance"} filtre */
export function filtrerTodos(todos, filtre = "tous", maintenant = new Date()) {
  switch (filtre) {
    case "afaire":
      return todos.filter((t) => !t.fait);
    case "faits":
      return todos.filter((t) => t.fait);
    case "retard":
      return todos.filter((t) => !t.fait && statutEcheance(t.echeance, maintenant) === "retard");
    case "sansEcheance":
      return todos.filter((t) => !t.echeance);
    default:
      return [...todos];
  }
}

const date = (v) => v ?? Number.MAX_SAFE_INTEGER;
const parId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Stable sort. "echeance": no due date last; "creation" and "modification": newest first, a todo
 * not yet confirmed by the server (null date) counts as the newest.
 * @param {"manuel"|"echeance"|"creation"|"modification"} tri
 */
export function trierPar(todos, tri = "manuel") {
  if (tri === "echeance")
    return [...todos].sort(
      (a, b) => compareJours(a.echeance ?? "", b.echeance ?? "") || a.ordre - b.ordre || parId(a, b),
    );
  if (tri === "creation")
    return [...todos].sort((a, b) => date(b.creeLe) - date(a.creeLe) || parId(a, b));
  if (tri === "modification")
    return [...todos].sort((a, b) => date(b.modifieLe) - date(a.modifieLe) || parId(a, b));
  return trierTodos(todos);
}

/** Search, then filter, then sort. */
export function afficherTodos(todos, { requete = "", filtre = "tous", tri = "manuel", index = null } = {}, maintenant = new Date()) {
  const ids = rechercherTodos(index ?? indexerTodos(todos), requete);
  const trouves = ids ? todos.filter((t) => ids.has(t.id)) : todos;
  return trierPar(filtrerTodos(trouves, filtre, maintenant), tri);
}

/**
 * Cuts a text into segments, the ones matching a word of the query marked, so the interface can
 * highlight them with `mark` nodes and textContent (never innerHTML). Accents and case ignored.
 * @returns {{ texte: string, marque: boolean }[]}
 */
export function segmenterSurbrillance(texte, requete) {
  const source = String(texte ?? "");
  const mots = motsDeRequete(requete);
  if (mots.length === 0 || !source) return [{ texte: source, marque: false }];
  // Normalised text with, for each of its characters, the index of the original one.
  let norm = "";
  const vers = [];
  [...source].forEach((c, i) => {
    const n = c.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const x of n) {
      norm += x;
      vers.push(i);
    }
  });
  const originaux = [...source];
  const marque = new Array(originaux.length).fill(false);
  for (const mot of mots) {
    for (let p = norm.indexOf(mot); p !== -1; p = norm.indexOf(mot, p + 1))
      for (let k = p; k < p + mot.length; k++) marque[vers[k]] = true;
  }
  const segments = [];
  originaux.forEach((c, i) => {
    const dernier = segments.at(-1);
    if (dernier && dernier.marque === marque[i]) dernier.texte += c;
    else segments.push({ texte: c, marque: marque[i] });
  });
  return segments;
}
