/**
 * Gallery of the sharing space (T6). Pure: no DOM, no Firebase.
 * An item here is the "view" of an element: { id, type, chiffre, verrouille, contenu, titre,
 * description, typeMime, creeLe, epingle }. `verrouille`: encrypted and not readable now, so
 * its content, title and name are never searched or shown.
 */
import { apercuPossible } from "./espacePartageFichiers.js";

export const FILTRES = [
  { id: "tout", libelle: "Tout" },
  { id: "images", libelle: "Images" },
  { id: "textes", libelle: "Textes et liens" },
  { id: "fichiers", libelle: "Fichiers" },
  { id: "chiffres", libelle: "Chiffrés" },
];

/** "images" | "textes" | "fichiers" ("images" only for a file the app can show). */
export function categorieDe(item) {
  if (item.type !== "fichier") return "textes";
  if (item.verrouille) return "fichiers";
  return apercuPossible(item.contenu, item.typeMime) ? "images" : "fichiers";
}

/** Items of one quick filter, then of the search text (accents and case ignored). */
export function filtrerItems(items, { filtre = "tout", recherche = "" } = {}) {
  const q = norme(recherche).trim();
  return items.filter((item) => {
    if (filtre === "chiffres" ? !item.chiffre : filtre !== "tout" && categorieDe(item) !== filtre)
      return false;
    if (!q) return true;
    if (item.verrouille) return false;
    return [item.titre, item.contenu, item.description].some((t) => norme(t).includes(q));
  });
}

/** How many items each quick filter would show (for the counters on the chips). */
export function compterFiltres(items) {
  return Object.fromEntries(
    FILTRES.map((f) => [f.id, filtrerItems(items, { filtre: f.id }).length]),
  );
}

const norme = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const jourDe = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Groups items like a photo library: pinned ones first, then "Aujourd'hui", "Hier", the days
 * of the last week ("mer. 28 oct."), then one group per month ("oct. 2026"). Items not yet
 * confirmed by the server (no creeLe) count as today. Order inside a group is kept.
 * @returns {{ cle: string, libelle: string, items: object[] }[]}
 */
export function grouperParDate(items, maintenant = Date.now(), locale = "fr-FR") {
  const aujourdhui = jourDe(maintenant);
  const groupes = [];
  const index = new Map();
  const ajouter = (cle, libelle, item) => {
    if (!index.has(cle)) {
      const g = { cle, libelle, items: [] };
      index.set(cle, g);
      groupes.push(g);
    }
    index.get(cle).items.push(item);
  };
  const epingles = items.filter((i) => i.epingle);
  for (const item of epingles) ajouter("epingles", "Épinglés", item);
  const jour = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const mois = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  for (const item of items) {
    if (item.epingle) continue;
    const ms = item.creeLe ?? maintenant;
    const ecart = Math.round((aujourdhui - jourDe(ms)) / 86_400_000);
    if (ecart <= 0) ajouter("j0", "Aujourd'hui", item);
    else if (ecart === 1) ajouter("j1", "Hier", item);
    else if (ecart < 7) ajouter(`j${jourDe(ms)}`, jour.format(ms), item);
    else {
      const d = new Date(ms);
      ajouter(`m${d.getFullYear()}-${d.getMonth()}`, mois.format(ms), item);
    }
  }
  return groupes;
}

/** Ids of the items still present among `ids` (a selection must follow the list). */
export const selectionValide = (ids, items) => {
  const presents = new Set(items.map((i) => i.id));
  return new Set([...ids].filter((id) => presents.has(id)));
};
