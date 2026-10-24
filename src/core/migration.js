import { PROFONDEUR_MAX, VERSION_SCHEMA } from "./constantes.js";
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

const BORNE = 10;

function elementValide(e) {
  if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id) return false;
  if (e.type === "site") return typeof e.titre === "string" && typeof e.url === "string";
  if (e.type === "dossier") return typeof e.titre === "string" && Array.isArray(e.items);
  return false;
}

/** Valid sites of a too-deep folder, all levels, in order (bounded walk). */
function sitesDe(items, ctx, profondeur = 0) {
  const sites = [];
  if (profondeur > BORNE) return sites;
  for (const e of items) {
    if (!elementValide(e)) ctx.ignores.push(e);
    else if (e.type === "site") sites.push(e);
    else sites.push(...sitesDe(e.items, ctx, profondeur + 1));
  }
  return sites;
}

/** A duplicated id gets a new, stable one: nothing is dropped. */
function idUnique(e, ctx) {
  if (!ctx.vus.has(e.id)) {
    ctx.vus.add(e.id);
    return e;
  }
  let n = 2;
  while (ctx.vus.has(`${e.id}~${n}`)) n++;
  const id = `${e.id}~${n}`;
  ctx.vus.add(id);
  ctx.corrections.push(`id dupliqué ${e.id} → ${id}`);
  return { ...e, id };
}

/** `niveau` is the level of the place holding `elements` (home = 0). */
function filtrer(elements, niveau, ctx) {
  const resultat = [];
  for (const e of elements) {
    if (!elementValide(e)) {
      ctx.ignores.push(e);
    } else if (e.type === "site") {
      resultat.push(idUnique(e, ctx));
    } else if (niveau >= PROFONDEUR_MAX) {
      // No folder at level 3: its sites take its place, nothing is deleted.
      ctx.corrections.push(`dossier trop profond « ${e.titre} » aplati`);
      for (const site of sitesDe(e.items, ctx)) resultat.push(idUnique(site, ctx));
    } else {
      const dossier = idUnique(e, ctx);
      resultat.push({ ...dossier, items: filtrer(e.items, niveau + 1, ctx) });
    }
  }
  return resultat;
}

/**
 * Checks the shape of a state. Invalid elements are left out of the in-memory state and
 * reported through `onIgnore` (they stay in storage until the user changes something).
 * Folders deeper than allowed are flattened and duplicated ids renamed, reported through
 * `onCorriger`: data coming from an import, a bug or another device is never dropped.
 */
export function valider(
  etat,
  onIgnore = (ignores) => console.warn("Éléments ignorés", ignores),
  onCorriger = (corrections) => console.warn("Données corrigées", corrections),
) {
  const base = etatInitial();
  const ctx = { ignores: [], corrections: [], vus: new Set() };
  const grille = Array.isArray(etat?.grille) ? filtrer(etat.grille, 0, ctx) : [];
  if (ctx.ignores.length) onIgnore(ctx.ignores);
  if (ctx.corrections.length) onCorriger(ctx.corrections);
  const reglages = etat?.reglages && typeof etat.reglages === "object" ? etat.reglages : {};
  return {
    ...etat,
    versionSchema: etat?.versionSchema ?? base.versionSchema,
    grille,
    reglages: { ...base.reglages, ...reglages },
  };
}
