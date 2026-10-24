import { VERSION_SCHEMA } from "./constantes.js";
import { etatInitial } from "./modele.js";

/** Successive migrations: MIGRATIONS[n] turns schema n into schema n + 1. */
const MIGRATIONS = {
  0: (brut) => ({ ...brut, versionSchema: 1 }),
};

/**
 * Brings raw stored data up to the current schema.
 * @returns {{ etat: object, lectureSeule: boolean }}
 */
export function migrer(brut) {
  if (brut == null || typeof brut !== "object") return { etat: etatInitial(), lectureSeule: false };
  let etat = { ...brut };
  let version = Number.isInteger(etat.versionSchema) ? etat.versionSchema : 0;
  if (version > VERSION_SCHEMA) return { etat: valider(etat), lectureSeule: true };
  while (version < VERSION_SCHEMA) {
    etat = MIGRATIONS[version](etat);
    version = etat.versionSchema;
  }
  return { etat: valider(etat), lectureSeule: false };
}

function elementValide(e, profondeur) {
  if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id) return false;
  if (e.type === "site") return typeof e.titre === "string" && typeof e.url === "string";
  if (e.type === "dossier")
    return typeof e.titre === "string" && Array.isArray(e.items) && profondeur < 10;
  return false;
}

function filtrer(elements, profondeur, ignores) {
  const resultat = [];
  for (const e of elements) {
    if (!elementValide(e, profondeur)) {
      ignores.push(e);
      continue;
    }
    resultat.push(
      e.type === "dossier" ? { ...e, items: filtrer(e.items, profondeur + 1, ignores) } : e,
    );
  }
  return resultat;
}

/**
 * Checks the shape of a state. Invalid elements are left out of the in-memory state and
 * reported through `onIgnore` (they stay in storage until the user changes something).
 */
export function valider(etat, onIgnore = (ignores) => console.warn("Éléments ignorés", ignores)) {
  const base = etatInitial();
  const ignores = [];
  const grille = Array.isArray(etat?.grille) ? filtrer(etat.grille, 0, ignores) : [];
  if (ignores.length) onIgnore(ignores);
  const reglages = etat?.reglages && typeof etat.reglages === "object" ? etat.reglages : {};
  return {
    ...etat,
    versionSchema: etat?.versionSchema ?? base.versionSchema,
    grille,
    reglages: { ...base.reglages, ...reglages },
  };
}
