/**
 * Tags and description of a site (V4.2): pure rules, shared by the reducer, the migration,
 * the import and the editing screen.
 *
 * Site = { …, tags: string[] (0 to 10), description: string (0 to 300),
 *          tagsManuels: boolean (true once the user wrote them by hand),
 *          ia: { etat: "aucun"|"en_attente"|"ok"|"echec", majLe: number|null, erreur?: string } }
 */
export const TAGS_MAX = 10;
export const TAG_LONGUEUR_MAX = 30;
export const DESCRIPTION_MAX = 300;
export const ETATS_IA = ["aucun", "en_attente", "ok", "echec"];

/**
 * Control characters: C0 (below 32), DEL and C1 (127 to 159), the line and paragraph
 * separators (8232, 8233), the zero-width characters (8203 to 8205) and the byte order mark
 * (65279). Tested by code, so that no invisible character has to be written in the source.
 */
const estControle = (code) =>
  code < 32 ||
  (code >= 127 && code <= 159) ||
  code === 8232 ||
  code === 8233 ||
  (code >= 8203 && code <= 8205) ||
  code === 65279;

/** Text with every control character replaced by a space (the line break kept on request). */
function sansControle(texte, garderRetour = false) {
  let resultat = "";
  for (const lettre of texte) {
    const code = lettre.codePointAt(0);
    resultat += estControle(code) && !(garderRetour && code === 10) ? " " : lettre;
  }
  return resultat;
}

/** Comparison key: no accents, no case (the tag keeps its own spelling). */
export const cleTag = (tag) => tag.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** One tag cleaned up, or null when nothing is left. */
export function normaliserTag(brut) {
  if (typeof brut !== "string") return null;
  const tag = sansControle(brut)
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!tag) return null;
  return [...tag].slice(0, TAG_LONGUEUR_MAX).join("").trim() || null;
}

/** Clean list: normalized, no duplicate (accents ignored), at most TAGS_MAX (the rest dropped). */
export function normaliserTags(liste) {
  const vus = new Set();
  const resultat = [];
  for (const brut of Array.isArray(liste) ? liste : []) {
    const tag = normaliserTag(brut);
    if (!tag || vus.has(cleTag(tag))) continue;
    if (resultat.length >= TAGS_MAX) break;
    vus.add(cleTag(tag));
    resultat.push(tag);
  }
  return resultat;
}

/** Text split into tags at commas, semicolons and line breaks (paste of a list). */
export const decouperTags = (texte) => String(texte ?? "").split(/[,;\n]+/);

/**
 * Description: trimmed, control characters removed, line breaks reduced to one, cut cleanly
 * at the last word when it is too long.
 */
export function normaliserDescription(brut) {
  if (typeof brut !== "string") return "";
  const texte = sansControle(brut.replace(/\r\n?/g, "\n"), true)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const lettres = [...texte];
  if (lettres.length <= DESCRIPTION_MAX) return texte;
  const coupe = lettres.slice(0, DESCRIPTION_MAX).join("");
  // Cut at the last space when it keeps most of the text, else at the limit.
  const dernierEspace = Math.max(coupe.lastIndexOf(" "), coupe.lastIndexOf("\n"));
  return (dernierEspace > DESCRIPTION_MAX * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trim();
}

/** `ia` state of a site made valid. */
export function normaliserEtatIa(ia) {
  const etat = ETATS_IA.includes(ia?.etat) ? ia.etat : "aucun";
  const resultat = { etat, majLe: Number.isFinite(ia?.majLe) ? ia.majLe : null };
  if (etat === "echec" && typeof ia?.erreur === "string" && ia.erreur) {
    resultat.erreur = ia.erreur.slice(0, 100);
  }
  return resultat;
}

/**
 * The four fields of a site made valid (given or default), for the creation, the
 * migration and every read: a site from an older version or from an import gets them.
 */
export function champsEnrichissement(site) {
  return {
    tags: normaliserTags(site?.tags),
    description: normaliserDescription(site?.description),
    tagsManuels: site?.tagsManuels === true,
    ia: normaliserEtatIa(site?.ia),
  };
}

/** Tags already used in a grid, most frequent first (for the suggestions), all levels. */
export function tagsUtilises(grille) {
  const compte = new Map();
  const visiter = (liste) => {
    for (const e of liste) {
      if (e.type === "dossier") visiter(e.items ?? []);
      else for (const t of e.tags ?? []) compte.set(t, (compte.get(t) ?? 0) + 1);
    }
  };
  visiter(grille ?? []);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}
