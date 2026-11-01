/**
 * Proposals of the assistant, on the browser side (V4.16). Pure: no DOM, no network.
 *
 *   convertir  the validated proposal of the server → items with the actions of the store, the
 *              ids being generated here, BEFORE anything is applied (determinism, V2.9);
 *   simuler    applies them one after the other on a state with THE SAME reducer and the same
 *              guards as the interface (peutPlacer…): an action that would be refused is marked
 *              with the reason and left out. The AI has no privileged path;
 *   resume     "Créer 1 dossier · Déplacer 4 éléments".
 */
import { A, nettoyerTitreDossier, reduire } from "./actions.js";
import {
  compterSites,
  niveauEmplacement,
  peutCreerDossierDans,
  peutPlacer,
  trouver,
} from "./arbre.js";
import { creerDossier, creerSite, genererIdParDefaut } from "./modele.js";
import { domaine } from "./url.js";

export const RAISONS = {
  INTROUVABLE: "élément introuvable (déjà supprimé ou déplacé ?)",
  CIBLE: "dossier de destination introuvable",
  BOUCLE: "un dossier ne peut pas être placé dans lui-même",
  PROFONDEUR: "dépasserait 3 niveaux de dossiers",
  AUCUN_CHANGEMENT: "déjà à jour",
};

const guillemets = (titre) => `« ${titre} »`;
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * @param {{ actions: object[] }} proposition
 * @param {{ grille: object[] }} etat state the proposal was written for (or the current one)
 * @param {{ genererId?: () => string, maintenant?: number }} [options]
 * @returns {{ index: number, outil: string, libelle: string, destructif: boolean,
 *   action: object|null, erreur?: string }[]}
 */
export function convertir(
  proposition,
  etat,
  { genererId = genererIdParDefaut, maintenant = Date.now() } = {},
) {
  const grille = etat.grille;
  // Folders created by the proposal, in order: { nouveau: n } is the n-th.
  const crees = [];
  const titresCrees = new Map();
  const resoudre = (ref) => (ref && typeof ref === "object" ? (crees[ref.nouveau] ?? undefined) : ref);
  const titreDe = (id) =>
    titresCrees.get(id) ?? trouver(grille, id)?.element.titre ?? "(introuvable)";
  const typeDe = (id) =>
    titresCrees.has(id) ? "dossier" : (trouver(grille, id)?.element.type ?? null);
  const dans = (parentId) => (parentId ? ` dans ${guillemets(titreDe(parentId))}` : "");

  return (proposition?.actions ?? []).map((a, index) => {
    const base = { index, outil: a.outil, destructif: false };
    switch (a.outil) {
      case "ajouter_site": {
        const parentId = resoudre(a.dossier ?? null);
        const site = creerSite({
          titre: a.titre ?? domaine(a.url),
          url: a.url,
          id: genererId(),
          creeLe: maintenant,
        });
        return {
          ...base,
          libelle: `Ajouter ${guillemets(site.titre)}${dans(parentId)}`,
          action: { type: A.SITE_AJOUTER, site, parentId: parentId ?? null },
          ...(parentId === undefined ? { erreur: "CIBLE" } : {}),
        };
      }
      case "creer_dossier": {
        const parentId = resoudre(a.parent ?? null);
        const id = genererId();
        const titre = nettoyerTitreDossier(a.titre);
        crees.push(id);
        titresCrees.set(id, titre);
        const rangement = a.sites?.length ? ` avec ${pluriel(a.sites.length, "site", "sites")}` : "";
        return {
          ...base,
          libelle: `Créer le dossier ${guillemets(titre)}${dans(parentId)}${rangement}`,
          action: {
            type: A.DOSSIER_CREER,
            dossier: creerDossier({ titre, id, creeLe: maintenant }),
            parentId: parentId ?? null,
            idsAInclure: a.sites ?? [],
          },
          ...(parentId === undefined ? { erreur: "CIBLE" } : {}),
        };
      }
      case "deplacer": {
        const vers = resoudre(a.vers ?? null);
        return {
          ...base,
          libelle: `Déplacer ${guillemets(titreDe(a.element))} vers ${vers ? guillemets(titreDe(vers)) : "l'accueil"}`,
          action: { type: A.ELEMENT_DEPLACER, id: a.element, versParentId: vers ?? null },
          ...(vers === undefined ? { erreur: "CIBLE" } : {}),
        };
      }
      case "renommer": {
        const type = typeDe(a.element);
        if (!type) return { ...base, libelle: `Renommer en ${guillemets(a.titre)}`, action: null, erreur: "INTROUVABLE" };
        return {
          ...base,
          libelle: `Renommer ${guillemets(titreDe(a.element))} en ${guillemets(a.titre)}`,
          action:
            type === "dossier"
              ? { type: A.DOSSIER_RENOMMER, id: a.element, titre: a.titre }
              : { type: A.SITE_MODIFIER, id: a.element, changements: { titre: a.titre } },
        };
      }
      case "supprimer": {
        const r = trouver(grille, a.element);
        const contenu =
          r?.element.type === "dossier"
            ? ` (${pluriel(compterSites(r.element), "site", "sites")} dedans)`
            : "";
        const nom = r ? `${r.element.type === "dossier" ? "le dossier " : ""}${guillemets(r.element.titre)}` : "un élément";
        return {
          ...base,
          destructif: true, // never ticked by default (the card)
          libelle: `Supprimer ${nom}${contenu}`,
          action: r ? { type: A.ELEMENT_SUPPRIMER, id: a.element } : null,
          ...(r ? {} : { erreur: "INTROUVABLE" }),
        };
      }
      case "modifier_tags": {
        const changements = {};
        if (a.tags) changements.tags = a.tags;
        if (a.description !== undefined) changements.description = a.description;
        return {
          ...base,
          libelle: `Modifier les tags ou la description de ${guillemets(titreDe(a.site))}`,
          action: { type: A.SITE_MODIFIER, id: a.site, changements },
        };
      }
      default:
        return { ...base, libelle: "Action inconnue", action: null, erreur: "INTROUVABLE" };
    }
  });
}

/** Why an item cannot be applied on `etat`, or null (checked with the rules of the interface). */
function verifier(etat, item) {
  const g = etat.grille;
  const a = item.action;
  if (item.erreur) return RAISONS[item.erreur];
  if (!a) return RAISONS.INTROUVABLE;
  switch (a.type) {
    case A.SITE_AJOUTER:
      return a.parentId != null && niveauEmplacement(g, a.parentId) < 0 ? RAISONS.CIBLE : null;
    case A.DOSSIER_CREER: {
      if (a.parentId != null && niveauEmplacement(g, a.parentId) < 0) return RAISONS.CIBLE;
      if (!peutCreerDossierDans(g, a.parentId)) return RAISONS.PROFONDEUR;
      return a.idsAInclure.some((id) => !trouver(g, id)) ? RAISONS.INTROUVABLE : null;
    }
    case A.ELEMENT_DEPLACER: {
      if (!trouver(g, a.id)) return RAISONS.INTROUVABLE;
      // The reducer would quietly keep the element in its place: here it is a refusal.
      if (a.versParentId != null && trouver(g, a.versParentId)?.element.type !== "dossier")
        return RAISONS.CIBLE;
      const r = peutPlacer(g, a.id, a.versParentId);
      return r.ok ? null : RAISONS[r.raison];
    }
    case A.DOSSIER_RENOMMER:
      return trouver(g, a.id)?.element.type === "dossier" ? null : RAISONS.INTROUVABLE;
    case A.SITE_MODIFIER:
      return trouver(g, a.id)?.element.type === "site" ? null : RAISONS.INTROUVABLE;
    case A.ELEMENT_SUPPRIMER:
      return trouver(g, a.id) ? null : RAISONS.INTROUVABLE;
    default:
      return RAISONS.INTROUVABLE;
  }
}

/**
 * @param {{ grille: object[] }} etat
 * @param {ReturnType<typeof convertir>} items
 * @param {Set<number>|null} [selection] indexes ticked by the user (null = all)
 * @returns {{ etatFinal: object, resultats: { item: object, ok: boolean, raison?: string,
 *   ignore?: boolean }[] }}
 */
export function simuler(etat, items, selection = null) {
  let courant = etat;
  const resultats = items.map((item) => {
    if (selection && !selection.has(item.index)) return { item, ok: false, ignore: true };
    const raison = verifier(courant, item);
    if (raison) return { item, ok: false, raison };
    const suivant = reduire(courant, item.action);
    // The reducer may hand back a new object holding the same values (same title…).
    if (suivant === courant || JSON.stringify(suivant.grille) === JSON.stringify(courant.grille))
      return { item, ok: false, raison: RAISONS.AUCUN_CHANGEMENT };
    courant = suivant;
    return { item, ok: true };
  });
  return { etatFinal: courant, resultats };
}

const LIBELLES_RESUME = {
  ajouter_site: ["Ajouter", "site", "sites"],
  creer_dossier: ["Créer", "dossier", "dossiers"],
  deplacer: ["Déplacer", "élément", "éléments"],
  renommer: ["Renommer", "élément", "éléments"],
  supprimer: ["Supprimer", "élément", "éléments"],
  modifier_tags: ["Modifier", "site", "sites"],
};

/** "Créer 1 dossier · Déplacer 4 éléments" for the actions of the results that are applicable. */
export function resume(resultats) {
  const n = {};
  for (const r of resultats) if (r.ok) n[r.item.outil] = (n[r.item.outil] ?? 0) + 1;
  const parties = Object.keys(LIBELLES_RESUME)
    .filter((o) => n[o])
    .map((o) => `${LIBELLES_RESUME[o][0]} ${pluriel(n[o], LIBELLES_RESUME[o][1], LIBELLES_RESUME[o][2])}`);
  return parties.join(" · ");
}

/**
 * Result of an application, for the status kept in the conversation: "appliquee" when every
 * action of the proposal was applied, "partielle" when some were not (unticked, refused).
 */
export function statutApres(resultats) {
  return resultats.every((r) => r.ok) ? "appliquee" : "partielle";
}
