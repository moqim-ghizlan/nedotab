/**
 * Instant local search over every site and folder, at any level. Pure: no DOM, no network.
 * Fields are weighted in one table (title, domain, path, tags and description since V4.7).
 * A word starting with "#" is a tag filter.
 */
import { aplatir } from "./arbre.js";
import { cleTag, tagsUtilises } from "./tags.js";
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

const SEPARATEURS = String.raw`\s\-_.·|/,;:()'`;
const DECOUPE = new RegExp(`[${SEPARATEURS}]+`);

/**
 * Weighted criteria, best one per query word (the table is sorted by points: the first test
 * that passes is the best). `champ` is where the match is, for the displayed reason.
 */
export const CRITERES = [
  { nom: "titreDebut", champ: "titre", points: 100, test: (e, m) => e.titreNorm.startsWith(m) },
  {
    nom: "motTitreDebut",
    champ: "titre",
    points: 60,
    test: (e, m) => e.motsTitre.some((w) => w.startsWith(m)),
  },
  { nom: "tagEgal", champ: "tag", points: 50, test: (e, m) => e.tagsNorm.includes(m) },
  { nom: "titreContient", champ: "titre", points: 40, test: (e, m) => e.titreNorm.includes(m) },
  {
    nom: "tagDebut",
    champ: "tag",
    points: 35,
    test: (e, m) => e.tagsNorm.some((t) => t.startsWith(m)),
  },
  {
    nom: "domaineDebut",
    champ: "domaine",
    points: 35,
    test: (e, m) => e.domaineNorm.startsWith(m),
  },
  {
    nom: "initiales",
    champ: "titre",
    points: 25,
    test: (e, m) => m.length >= 2 && e.initiales.startsWith(m),
  },
  {
    nom: "tagContient",
    champ: "tag",
    points: 20,
    test: (e, m) => e.tagsNorm.some((t) => t.includes(m)),
  },
  {
    nom: "domaineContient",
    champ: "domaine",
    points: 20,
    test: (e, m) => e.domaineNorm.includes(m),
  },
  {
    nom: "descriptionDebutMot",
    champ: "description",
    points: 15,
    test: (e, m) => e.motsDescription.some((w) => w.startsWith(m)),
  },
  { nom: "cheminContient", champ: "chemin", points: 10, test: (e, m) => e.cheminNorm.includes(m) },
  {
    nom: "descriptionContient",
    champ: "description",
    points: 5,
    test: (e, m) => e.descriptionNorm.includes(m),
  },
];
export const BONUS_ACCUEIL = 15;

const caches = new WeakMap();

/** Search index of a grid, memoised on the grid reference (rebuilt only when it changes). */
export function indexer(grille) {
  const deja = caches.get(grille);
  if (deja) return deja;
  const index = aplatir(grille).map(({ element, chemin }) => {
    const { norm, vers } = normaliserAvecCorrespondance(element.titre);
    const site = element.type === "site";
    const dom = site ? domaine(element.url) : "";
    const cheminTexte = ["Accueil", ...chemin.map((d) => d.titre)].join(" › ");
    const descriptionNorm = site ? normaliser(element.description) : "";
    const tags = site ? (element.tags ?? []) : [];
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
      tags,
      tagsNorm: tags.map(normaliser),
      descriptionNorm,
      motsDescription: descriptionNorm.split(DECOUPE).filter(Boolean),
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

const ECHAPPER = /[.*+?^${}()|[\]\\]/g;

/** [start, end) in the original text of `mot` (start of a word preferred), or null. */
function plageDansTexte(norm, vers, texte, mot) {
  const debutMot = new RegExp(`(^|[${SEPARATEURS}])${mot.replace(ECHAPPER, "\\$&")}`);
  const m = norm.match(debutMot);
  const i = m ? m.index + m[1].length : norm.indexOf(mot);
  if (i < 0) return null;
  const finNorm = i + mot.length;
  return [vers[i], finNorm < vers.length ? vers[finNorm] : texte.length];
}

/** Ranges of the displayed title matched by `mot`. */
function plagesDansTitre(entree, mot) {
  const plage = plageDansTexte(entree.titreNorm, entree.versTitre, entree.titre, mot);
  return plage ? [plage] : [];
}

const LONGUEUR_EXTRAIT = 60;

/**
 * Where the best match is: `{ champ, texte, plages }`. For a tag the text is the tag, for the
 * description an excerpt of about 60 characters around the word ("…" where it is cut).
 */
function raisonDe(entree, champ, mot) {
  if (champ === "tag") {
    const tag = entree.tags.find((t) => normaliser(t).includes(mot)) ?? entree.tags[0];
    const { norm, vers } = normaliserAvecCorrespondance(tag);
    const plage = plageDansTexte(norm, vers, tag, mot);
    return { champ, texte: tag, plages: plage ? [plage] : [] };
  }
  if (champ === "description") {
    const description = entree.element.description;
    const { norm, vers } = normaliserAvecCorrespondance(description);
    const plage = plageDansTexte(norm, vers, description, mot);
    if (!plage) return { champ, texte: "", plages: [] };
    const debut = Math.max(0, Math.min(plage[0] - 20, description.length - LONGUEUR_EXTRAIT));
    const fin = Math.min(description.length, Math.max(debut + LONGUEUR_EXTRAIT, plage[1]));
    const brut = description.slice(debut, fin);
    const marge = brut.length - brut.trimStart().length;
    const avant = debut > 0 ? "… " : "";
    const apres = fin < description.length ? " …" : "";
    const decalage = avant.length - debut - marge;
    return {
      champ,
      texte: `${avant}${brut.trim()}${apres}`,
      plages: [[plage[0] + decalage, plage[1] + decalage]],
    };
  }
  return { champ, texte: "", plages: [] };
}

/** Words of a query split into plain words and `#` filters (tags to require). */
export function decouperRequete(requete) {
  const mots = normaliser(requete).split(" ").filter(Boolean);
  return {
    mots: mots.filter((m) => !m.startsWith("#")),
    filtres: mots.filter((m) => m.startsWith("#") && m.length > 1).map((m) => m.slice(1)),
  };
}

/**
 * @returns {{ entree: object, score: number, plages: [number, number][],
 *   raison: { champ: "titre"|"domaine"|"chemin"|"tag"|"description", texte: string,
 *   plages: [number, number][] } }[]} at most `max` results. Every word of the query must
 *   match somewhere (title, domain, path, initials, tags, description) and every `#tag`
 *   filter must match the start of a tag of the site. `raison` is the best matching field.
 */
export function rechercher(index, requete, max = 8) {
  const { mots, filtres } = decouperRequete(requete);
  if (mots.length === 0 && filtres.length === 0) return [];
  const collator = new Intl.Collator("fr");
  const avant = (a, b) => b.score - a.score || collator.compare(a.entree.titre, b.entree.titre);
  // Only the best `max` are kept (sorted insertion): no full sort of every match.
  const resultats = [];
  for (const entree of index) {
    if (filtres.some((f) => !entree.tagsNorm.some((t) => t.startsWith(f)))) continue;
    let score = 0;
    let toutTrouve = true;
    let meilleur = null; // { critere, mot }
    for (const mot of mots) {
      const critere = CRITERES.find((c) => c.test(entree, mot));
      if (!critere) {
        toutTrouve = false;
        break;
      }
      score += critere.points;
      if (!meilleur || critere.points > meilleur.critere.points) meilleur = { critere, mot };
    }
    if (!toutTrouve) continue;
    if (entree.type === "site" && entree.chemin.length === 0) score += BONUS_ACCUEIL;
    const candidat = { entree, score, meilleur };
    if (resultats.length === max && avant(candidat, resultats[max - 1]) >= 0) continue;
    let i = resultats.length;
    while (i > 0 && avant(candidat, resultats[i - 1]) < 0) i--;
    resultats.splice(i, 0, candidat);
    if (resultats.length > max) resultats.pop();
  }
  // Highlighting and reasons are only computed for what is displayed.
  return resultats.map(({ entree, score, meilleur }) => ({
    entree,
    score,
    plages: fusionnerPlages(mots.flatMap((mot) => plagesDansTitre(entree, mot))),
    raison: meilleur
      ? raisonDe(entree, meilleur.critere.champ, meilleur.mot)
      : raisonDe(entree, "tag", filtres[0]),
  }));
}

/** Most used tags starting with `prefixe` (without "#"), for the "#" suggestions. */
export function suggererTags(grille, prefixe = "", max = 10) {
  const debut = cleTag(prefixe);
  return tagsUtilises(grille)
    .filter((t) => cleTag(t).startsWith(debut))
    .slice(0, max);
}
