// Copy of src/core/outils.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Actions the assistant may PROPOSE (V4.16). The model never changes anything: it writes a
 * block ```actions [...] ``` at the end of its answer; the server validates it strictly
 * (this module, identical copy in functions/src/partage/) and turns the short references
 * (s12, d3, nouveau:0) into real ids; the browser converts the result into store actions,
 * simulates them and shows them as a card the user must confirm (src/core/propositions.js).
 * Pure: no DOM, no network.
 *
 * Normalised action (what the server sends back), `Ref` = null (home) | "real id" | { nouveau: n }
 *   { outil: "ajouter_site",  url, titre?, dossier: Ref }
 *   { outil: "creer_dossier", titre, parent: Ref, sites: [id] }
 *   { outil: "deplacer",      element: id, vers: Ref }
 *   { outil: "renommer",      element: id, titre }
 *   { outil: "supprimer",     element: id }
 *   { outil: "modifier_tags", site: id, tags?: [string], description?: string }
 * `{ nouveau: n }` is the n-th folder created earlier in the same proposal.
 */
import { normaliserUrl } from "./url.js";

export const ACTIONS_MAX = 20;
export const TITRE_ACTION_MAX = 60;
export const TAGS_ACTION_MAX = 10;
export const TAG_ACTION_MAX = 30;
export const DESCRIPTION_ACTION_MAX = 300;
export const OUTILS = [
  "ajouter_site",
  "creer_dossier",
  "deplacer",
  "renommer",
  "supprimer",
  "modifier_tags",
];
/** Shown when the model wrote only the block. */
export const TEXTE_PROPOSITION_PAR_DEFAUT = "Voici ce que je propose :";
export const STATUTS_PROPOSITION = ["en_attente", "appliquee", "ignoree", "partielle"];

const BLOC = /```actions[ \t]*\r?\n([\s\S]*?)\r?\n?```/gi;
const BLOC_OUVERT = /```actions[\s\S]*$/i;

/**
 * Takes the ```actions block off an answer.
 * @returns {{ texte: string, brut: unknown[]|null }} `brut`: the parsed array (the last block
 *   that is valid JSON), null when there is none or it cannot be read
 */
export function extraireBlocActions(texte) {
  const source = String(texte ?? "");
  let brut = null;
  for (const m of source.matchAll(BLOC)) {
    try {
      const v = JSON.parse(m[1]);
      if (Array.isArray(v)) brut = v;
    } catch {
      /* not JSON: ignored */
    }
  }
  const sans = source.replace(BLOC, "").replace(BLOC_OUVERT, "").trimEnd();
  return { texte: sans, brut };
}

/** For the screen: the block is never shown, even when it is still being written. */
export const masquerBlocActions = (texte) =>
  String(texte ?? "")
    .replace(BLOC, "")
    .replace(BLOC_OUVERT, "")
    .trimEnd();

const texteCourt = (v, max) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.length <= max ? t : null;
};

/**
 * @param {unknown} brut array of actions written by the model
 * @param {{ sites: Record<string, string>, dossiers: Record<string, string> }} tables
 *   "s12" → site id, "d3" → folder id, for THIS answer only
 * @returns {{ actions: object[], refusees: { index: number, raison: string }[] }} at most 20
 *   valid actions; the others are dropped with the reason (never applied by guessing)
 */
export function validerActions(brut, { sites = {}, dossiers = {} } = {}) {
  const actions = [];
  const refusees = [];
  if (!Array.isArray(brut)) return { actions, refusees };
  const idSite = (r) => (typeof r === "string" && Object.hasOwn(sites, r) ? sites[r] : null);
  const idDossier = (r) => (typeof r === "string" && Object.hasOwn(dossiers, r) ? dossiers[r] : null);
  const idElement = (r) => idSite(r) ?? idDossier(r);
  // The n-th folder the model writes ("nouveau:n") → position among the accepted ones.
  const crees = new Map();
  let ecrits = 0;
  /** A folder reference: undefined = invalid, null = home. */
  const refDossier = (r, { accueil = true } = {}) => {
    if (r == null || r === "accueil") return accueil ? null : undefined;
    const m = typeof r === "string" ? r.match(/^nouveau:(\d+)$/) : null;
    if (m) return crees.has(Number(m[1])) ? { nouveau: crees.get(Number(m[1])) } : undefined;
    return idDossier(r) ?? undefined;
  };
  const refuser = (index, raison) => refusees.push({ index, raison });

  brut.forEach((a, index) => {
    if (actions.length >= ACTIONS_MAX) return refuser(index, "trop d'actions");
    if (!a || typeof a !== "object" || Array.isArray(a)) return refuser(index, "action invalide");
    const outil = a.outil;
    if (!OUTILS.includes(outil)) return refuser(index, "outil inconnu");
    switch (outil) {
      case "ajouter_site": {
        const u = normaliserUrl(a.url);
        const titre = a.titre == null ? null : texteCourt(a.titre, TITRE_ACTION_MAX);
        const dossier = refDossier(a.dossier);
        if (!u.ok || (a.titre != null && !titre)) return refuser(index, "adresse ou titre invalide");
        if (dossier === undefined) return refuser(index, "dossier inconnu");
        return actions.push({ outil, url: u.url, ...(titre ? { titre } : {}), dossier });
      }
      case "creer_dossier": {
        const numero = ecrits++;
        const titre = texteCourt(a.titre, TITRE_ACTION_MAX);
        const parent = refDossier(a.parent);
        const liste = a.sites == null ? [] : a.sites;
        if (!titre) return refuser(index, "titre invalide");
        if (parent === undefined) return refuser(index, "dossier parent inconnu");
        if (!Array.isArray(liste) || liste.length > 100 || !liste.every((s) => idSite(s)))
          return refuser(index, "site inconnu");
        crees.set(numero, [...crees.keys()].length);
        return actions.push({
          outil,
          titre,
          parent,
          sites: [...new Set(liste.map(idSite))],
        });
      }
      case "deplacer": {
        const element = idElement(a.element);
        const vers = refDossier(a.vers);
        if (!element) return refuser(index, "élément inconnu");
        if (vers === undefined) return refuser(index, "destination inconnue");
        if (vers === element) return refuser(index, "un dossier ne se déplace pas dans lui-même");
        return actions.push({ outil, element, vers });
      }
      case "renommer": {
        const element = idElement(a.element);
        const titre = texteCourt(a.titre, TITRE_ACTION_MAX);
        if (!element) return refuser(index, "élément inconnu");
        if (!titre) return refuser(index, "titre invalide");
        return actions.push({ outil, element, titre });
      }
      case "supprimer": {
        const element = idElement(a.element);
        if (!element) return refuser(index, "élément inconnu");
        return actions.push({ outil, element });
      }
      case "modifier_tags": {
        const site = idSite(a.site);
        if (!site) return refuser(index, "site inconnu");
        const sortie = { outil, site };
        if (a.tags != null) {
          if (
            !Array.isArray(a.tags) ||
            a.tags.length > TAGS_ACTION_MAX ||
            !a.tags.every((t) => texteCourt(t, TAG_ACTION_MAX))
          )
            return refuser(index, "tags invalides");
          sortie.tags = a.tags.map((t) => texteCourt(t, TAG_ACTION_MAX));
        }
        if (a.description != null) {
          if (typeof a.description !== "string" || a.description.length > DESCRIPTION_ACTION_MAX)
            return refuser(index, "description invalide");
          sortie.description = a.description.trim();
        }
        if (!("tags" in sortie) && !("description" in sortie))
          return refuser(index, "rien à modifier");
        return actions.push(sortie);
      }
      default:
        return refuser(index, "outil inconnu");
    }
  });
  return { actions, refusees };
}
