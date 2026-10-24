/**
 * Instant local search over every site and folder, at any level. Pure: no DOM, no network.
 * Fields are weighted in one table so that later versions (tags, description in V4.7) only
 * add rows.
 */
import { aplatir } from "./arbre.js";
import { domaine } from "./url.js";

/** Lower case, no accents, single spaces. */
export function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalises character by character and keeps, for each normalised character, the index of
 * the original one: highlighted ranges can then be mapped back onto the displayed title.
 */
function normaliserAvecCorrespondance(texte) {
  let norm = "";
  const vers = [];
  [...String(texte ?? "")].forEach((c, i, tous) => {
    const n = c
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const position = tous.slice(0, i).join("").length;
    for (const x of n) {
      norm += /\s/.test(x) ? " " : x;
      vers.push(position);
    }
  });
  return { norm, vers };
}

/** Initials: first letter of each word plus inner capitals ("GitHub" → "gh"). */
function initiales(titre) {
  const lettres = [];
  for (const mot of String(titre).split(/[\s\-_.·|/]+/)) {
    [...mot].forEach((c, i) => {
      if (i === 0 || (c !== c.toLowerCase() && c === c.toUpperCase())) lettres.push(c);
    });
  }
  return normaliser(lettres.join(""));
}

/** Weighted criteria, best one per query word. */
export const CRITERES = [
  { nom: "titreDebut", points: 100, test: (e, m) => e.titreNorm.startsWith(m) },
  { nom: "motTitreDebut", points: 60, test: (e, m) => e.motsTitre.some((w) => w.startsWith(m)) },
  { nom: "titreContient", points: 40, test: (e, m) => e.titreNorm.includes(m) },
  { nom: "domaineDebut", points: 35, test: (e, m) => e.domaineNorm.startsWith(m) },
  { nom: "initiales", points: 25, test: (e, m) => m.length >= 2 && e.initiales.startsWith(m) },
  { nom: "domaineContient", points: 20, test: (e, m) => e.domaineNorm.includes(m) },
  { nom: "cheminContient", points: 10, test: (e, m) => e.cheminNorm.includes(m) },
];
export const BONUS_ACCUEIL = 15;

const caches = new WeakMap();

/** Search index of a grid, memoised on the grid reference (rebuilt only when it changes). */
export function indexer(grille) {
  const deja = caches.get(grille);
  if (deja) return deja;
  const index = aplatir(grille).map(({ element, chemin }) => {
    const { norm, vers } = normaliserAvecCorrespondance(element.titre);
    const dom = element.type === "site" ? domaine(element.url) : "";
    const cheminTexte = ["Accueil", ...chemin.map((d) => d.titre)].join(" › ");
    return {
      id: element.id,
      type: element.type,
      element,
      titre: element.titre,
      domaine: dom,
      chemin,
      cheminTexte,
      titreNorm: norm,
      versTitre: vers,
      motsTitre: norm.split(/[\s\-_.·|/]+/).filter(Boolean),
      initiales: initiales(element.titre),
      domaineNorm: normaliser(dom),
      cheminNorm: normaliser(chemin.map((d) => d.titre).join(" ")),
    };
  });
  caches.set(grille, index);
  return index;
}

/** Merges overlapping [start, end) ranges. */
function fusionnerPlages(plages) {
  const triees = [...plages].sort((a, b) => a[0] - b[0]);
  const resultat = [];
  for (const p of triees) {
    const d = resultat.at(-1);
    if (d && p[0] <= d[1]) d[1] = Math.max(d[1], p[1]);
    else resultat.push([...p]);
  }
  return resultat;
}

/** Ranges of the displayed title matched by `mot` (start of a word preferred). */
function plagesDansTitre(entree, mot) {
  const { titreNorm, versTitre, titre } = entree;
  const debutMot = new RegExp(`(^|[\\s\\-_.·|/])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const m = titreNorm.match(debutMot);
  const i = m ? m.index + m[1].length : titreNorm.indexOf(mot);
  if (i < 0) return [];
  const debut = versTitre[i];
  const finNorm = i + mot.length;
  const fin = finNorm < versTitre.length ? versTitre[finNorm] : titre.length;
  return [[debut, fin]];
}

/**
 * @returns {{ entree: object, score: number, plages: [number, number][] }[]} at most `max`
 *   results; every word of the query must match somewhere (title, domain, path, initials).
 */
export function rechercher(index, requete, max = 8) {
  const mots = normaliser(requete).split(" ").filter(Boolean);
  if (mots.length === 0) return [];
  const resultats = [];
  for (const entree of index) {
    let score = 0;
    let toutTrouve = true;
    for (const mot of mots) {
      const critere = CRITERES.find((c) => c.test(entree, mot));
      if (!critere) {
        toutTrouve = false;
        break;
      }
      score += critere.points;
    }
    if (!toutTrouve) continue;
    if (entree.type === "site" && entree.chemin.length === 0) score += BONUS_ACCUEIL;
    resultats.push({ entree, score });
  }
  const collator = new Intl.Collator("fr");
  resultats.sort((a, b) => b.score - a.score || collator.compare(a.entree.titre, b.entree.titre));
  // Highlighting is only computed for what is displayed.
  return resultats.slice(0, max).map((r) => ({
    ...r,
    plages: fusionnerPlages(mots.flatMap((mot) => plagesDansTitre(r.entree, mot))),
  }));
}
