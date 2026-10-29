// Copy of src/core/preFiltre.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Pre-filter of the sites before the smart search (V4.9): above SEUIL_PREFILTRE sites, only the
 * most likely ones are sent to the model (cost and quality). Shared by the browser (tests) and
 * the server (functions/src/partage/, identical copy). Pure, tolerant, no network.
 */
export const SEUIL_PREFILTRE = 400;
export const SITES_GARDES = 150;
export const LIGNES_MAX = 200;

const MOTS_VIDES = new Set(
  (
    "alors aucun avec avoir cette dans des donc elle elles est les mes mon mais nous pas par " +
    "pour que qui quel quelle quels sans ses son sur ton tes toi une vos votre vous the and " +
    "for with from that this have where what which site sites outil outils ajoute ajoutes " +
    "montre moi trouve trouver cherche chercher"
  ).split(" "),
);

const norm = (texte) =>
  String(texte ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Stems of the words of a question: short prefixes, so that "retoucher" finds "retouche". */
export function racinesDeQuestion(question) {
  const racines = new Set();
  for (const mot of norm(question).split(/[^\p{L}\p{N}]+/u)) {
    if (mot.length < 3 || MOTS_VIDES.has(mot)) continue;
    racines.add(mot.length <= 4 ? mot : mot.slice(0, Math.min(6, mot.length - 1)));
  }
  return [...racines];
}

function score(site, racines) {
  const fort = norm(`${site.titre} ${site.tags.join(" ")}`);
  const description = norm(site.description);
  const faible = norm(`${site.url} ${site.chemin.join(" ")}`);
  let points = 0;
  for (const r of racines) {
    if (fort.includes(r)) points += 3;
    if (description.includes(r)) points += 2;
    if (faible.includes(r)) points += 1;
  }
  return points;
}

/**
 * @param {Array<{ id: string, titre: string, url: string, tags: string[], description: string,
 *   chemin: string[], creeLe: number }>} sites
 * @returns {{ sites: typeof sites, preFiltre: boolean }} the whole list when it is small;
 *   else the 150 best matches plus, for diversity, sites taken in turn from each top-level
 *   folder, 200 at most.
 */
export function preFiltrer(sites, question, { seuil = SEUIL_PREFILTRE } = {}) {
  if (sites.length <= seuil) return { sites, preFiltre: false };
  const racines = racinesDeQuestion(question);
  const notes = sites
    .map((site) => ({ site, points: score(site, racines) }))
    .sort((a, b) => b.points - a.points || b.site.creeLe - a.site.creeLe);
  const gardes = notes.slice(0, SITES_GARDES).map((n) => n.site);
  // Diversity: the best of the others, folder by folder in turn.
  const groupes = new Map();
  for (const { site } of notes.slice(SITES_GARDES)) {
    const cle = site.chemin[0] ?? "";
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(site);
  }
  const files = [...groupes.values()];
  while (gardes.length < LIGNES_MAX && files.some((f) => f.length)) {
    for (const f of files) {
      if (gardes.length >= LIGNES_MAX) break;
      if (f.length) gardes.push(f.shift());
    }
  }
  return { sites: gardes, preFiltre: true };
}
