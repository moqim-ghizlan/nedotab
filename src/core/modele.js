/**
 * Data model. Every object is plain JSON (it will be stored as-is, then synced).
 *
 * @typedef {{ type: "lettre", couleur: string, texte?: string }
 *         | { type: "url", valeur: string, source: "html"|"chrome"|"google"|"perso" }
 *         | { type: "image", valeur: string }} Icone
 * @typedef {{ id: string, type: "site", titre: string, url: string, icone: Icone, creeLe: number }} Site
 * @typedef {{ id: string, type: "dossier", titre: string, items: Element[], creeLe: number }} Dossier
 * @typedef {Site | Dossier} Element
 * @typedef {{ theme: "auto"|"clair"|"sombre", fond: object }} Reglages
 * @typedef {{ versionSchema: number, grille: Element[], reglages: Reglages }} Etat
 */
import { VERSION_SCHEMA } from "./constantes.js";
import { couleurDepuisTexte } from "./couleurs.js";

export const genererIdParDefaut = () => globalThis.crypto.randomUUID();

function texteObligatoire(valeur, champ) {
  if (typeof valeur !== "string" || valeur.trim() === "") {
    throw new Error(`Champ « ${champ} » obligatoire`);
  }
  return valeur.trim();
}

/** @returns {Site} */
export function creerSite({ titre, url, icone, id, creeLe }, genererId = genererIdParDefaut) {
  const urlPropre = texteObligatoire(url, "url");
  return {
    id: id ?? genererId(),
    type: "site",
    titre: texteObligatoire(titre, "titre"),
    url: urlPropre,
    icone: icone ? { ...icone } : { type: "lettre", couleur: couleurDepuisTexte(urlPropre) },
    creeLe: creeLe ?? Date.now(),
  };
}

/** @returns {Dossier} */
export function creerDossier({ titre, items = [], id, creeLe }, genererId = genererIdParDefaut) {
  return {
    id: id ?? genererId(),
    type: "dossier",
    titre: texteObligatoire(titre, "titre"),
    items: [...items],
    creeLe: creeLe ?? Date.now(),
  };
}

/** @returns {Etat} */
export function etatInitial() {
  return {
    versionSchema: VERSION_SCHEMA,
    grille: [],
    reglages: { theme: "auto", fond: { type: "aucun" } },
  };
}
