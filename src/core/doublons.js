/**
 * Duplicates of the grid (V4.17). Pure, no AI, works without an account.
 *  - exact: the same address once scheme, "www.", case and trailing slash are ignored (cleUrl);
 *  - probable: the same page once tracking parameters (utm_*, fbclid, gclid, ref…) and the
 *    "#fragment" are ignored too, while the addresses written differ.
 */
import { cleUrl } from "./url.js";

const SUIVI = /^(utm_|fbclid$|gclid$|ref$|mc_|igshid$|msclkid$)/i;

/** Same page, tracking removed: "exemple.fr/p?id=3". */
export function cleSansSuivi(url) {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !SUIVI.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const requete = params.map(([k, v]) => `${k}=${v}`).join("&");
    const chemin = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${chemin}${requete ? `?${requete}` : ""}`;
  } catch {
    return cleUrl(url);
  }
}

function sitesAvecChemin(grille) {
  const sites = [];
  const visiter = (liste, chemin) => {
    for (const e of Array.isArray(liste) ? liste : []) {
      if (e?.type === "dossier") visiter(e.items, [...chemin, String(e.titre ?? "")]);
      else if (e?.type === "site" && e.url)
        sites.push({ id: e.id, titre: String(e.titre ?? ""), url: e.url, chemin });
    }
  };
  visiter(grille, []);
  return sites;
}

/**
 * @returns {{ exacts: Groupe[], probables: Groupe[] }} Groupe = { cle, copies: [{ id, titre,
 *   url, chemin }] }, each group holding at least two sites, in grid order.
 */
export function groupesDoublons(grille) {
  const groupes = new Map();
  for (const s of sitesAvecChemin(grille)) {
    const cle = cleSansSuivi(s.url);
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(s);
  }
  const exacts = [];
  const probables = [];
  for (const [cle, copies] of groupes) {
    if (copies.length < 2) continue;
    const identiques = new Set(copies.map((c) => cleUrl(c.url))).size === 1;
    (identiques ? exacts : probables).push({ cle, copies });
  }
  return { exacts, probables };
}

/**
 * The proposal (V4.16 format) that keeps `garderId` and deletes the other copies of the group:
 * shown with the same confirmation card, deletions listed.
 */
export function propositionGarder(groupe, garderId) {
  return {
    id: `doublon-${groupe.cle}-${garderId}`.slice(0, 120),
    actions: groupe.copies
      .filter((c) => c.id !== garderId)
      .map((c) => ({ outil: "supprimer", element: c.id })),
  };
}
