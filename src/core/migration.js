import { PROFONDEUR_MAX, VERSION_SCHEMA } from "./constantes.js";
import { etatInitial } from "./modele.js";
import { avecPagesValides, validerReglages, validerReglagesAppareil } from "./reglages.js";
import { champsEnrichissement } from "./tags.js";

/** Every site of a grid (all levels) with its tags, description and AI state completed. */
function enrichir(elements) {
  if (!Array.isArray(elements)) return elements;
  return elements.map((e) => {
    if (!e || typeof e !== "object") return e;
    if (e.type === "dossier") return { ...e, items: enrichir(e.items) };
    if (e.type === "site") return { ...e, ...champsEnrichissement(e) };
    return e;
  });
}

/** Successive migrations: MIGRATIONS[n] turns schema n into schema n + 1. */
const MIGRATIONS = {
  0: (brut) => ({ ...brut, versionSchema: 1 }),
  // 1 → 2: settings split. A local picture background is never synced: it moves to
  // reglagesAppareil (this device only); the synced reglages keep everything else.
  1: (brut) => {
    const reglages = brut.reglages && typeof brut.reglages === "object" ? brut.reglages : {};
    if (reglages.fond?.type === "image") {
      return {
        ...brut,
        versionSchema: 2,
        reglages: { ...reglages, fond: { type: "aucun" } },
        reglagesAppareil: { fond: reglages.fond },
      };
    }
    return { ...brut, versionSchema: 2, reglagesAppareil: brut.reglagesAppareil ?? {} };
  },
  // 2 → 3 (V4.2): every site gets tags, a description and an AI state, at every level. An
  // older version reading schema 3 goes read-only: it cannot write sites without them.
  2: (brut) => ({ ...brut, versionSchema: 3, grille: enrichir(brut.grille) }),
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

/** V4.20: iaExclu is kept only when true (absent = shown to the AI). */
function avecExclusion(e) {
  if (e.iaExclu === true) return e;
  if (!("iaExclu" in e)) return e;
  const copie = { ...e };
  delete copie.iaExclu;
  return copie;
}

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
      resultat.push(idUnique(avecExclusion({ ...e, ...champsEnrichissement(e) }), ctx));
    } else if (niveau >= PROFONDEUR_MAX) {
      // No folder at level 3: its sites take its place, nothing is deleted.
      ctx.corrections.push(`dossier trop profond « ${e.titre} » aplati`);
      for (const site of sitesDe(e.items, ctx))
        resultat.push(idUnique({ ...site, ...champsEnrichissement(site) }, ctx));
    } else {
      const dossier = idUnique(avecExclusion(e), ctx);
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
  return {
    ...etat,
    versionSchema: etat?.versionSchema ?? base.versionSchema,
    grille,
    reglages: avecPagesValides(
      validerReglages({ ...base.reglages, ...etat?.reglages }),
      grille.length,
    ),
    reglagesAppareil: validerReglagesAppareil(etat?.reglagesAppareil),
  };
}
