/**
 * Import of an export file (V2.10). Pure: strict validation, then what to restore or merge.
 * An invalid file changes nothing and gives the first understandable error, with the line
 * of the file when it can be found ("Ligne 45 : adresse refusée (javascript:)").
 */
import { PROFONDEUR_MAX, VERSION_SCHEMA } from "./constantes.js";
import { FORMAT_EXPORT } from "./export.js";
import { dateCourte, dossierImporte } from "./fusion.js";
import { migrer } from "./migration.js";
import { SEUIL_BLOCAGE, estimerTaille } from "./taille.js";
import { normaliserUrl } from "./url.js";

export const TAILLE_FICHIER_MAX = 5 * 1024 * 1024;
export const TITRE_MAX = 200;
export const ICONE_IMPORTEE_MAX = 16 * 1024;
const BORNE = 10;
const IMAGES_ACCEPTEES = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Refused before reading: a file over 5 MB is never loaded. */
export function verifierTailleFichier(octets) {
  return octets > TAILLE_FICHIER_MAX
    ? "Fichier trop volumineux (plus de 5 Mo) : ce n'est pas un export NedoTab."
    : null;
}

class ErreurImport extends Error {
  constructor(message, valeur) {
    super(message);
    this.valeur = valeur;
  }
}

/** Line of `valeur` in the JSON text (first occurrence), or null. */
function ligneDe(texte, valeur) {
  if (valeur == null) return null;
  const i = texte.indexOf(JSON.stringify(valeur));
  return i < 0 ? null : texte.slice(0, i).split("\n").length;
}

function verifierIcone(icone, titre) {
  if (icone == null) return;
  if (typeof icone !== "object") throw new ErreurImport(`icône invalide (« ${titre} »)`);
  if (icone.type === "lettre") return;
  if (icone.type === "image") {
    const m = typeof icone.valeur === "string" && icone.valeur.match(IMAGES_ACCEPTEES);
    if (!m)
      throw new ErreurImport("icône refusée (seules les images PNG, WebP, JPEG)", icone.valeur);
    if ((m[2].length * 3) / 4 > ICONE_IMPORTEE_MAX) {
      throw new ErreurImport("icône trop lourde (16 Ko au plus)", icone.valeur);
    }
    return;
  }
  if (icone.type === "url") {
    const v = String(icone.valeur ?? "");
    // An icon of the browser's own favicon cache (chrome-extension://…/_favicon/) is allowed.
    if (/^chrome-extension:\/\/[a-p]{32}\/_favicon\/\?/.test(v)) return;
    if (!/^https?:\/\//i.test(v)) throw new ErreurImport("adresse d'icône refusée", icone.valeur);
    return;
  }
  throw new ErreurImport(`type d'icône inconnu « ${icone.type} »`, icone.type);
}

/** Checks every element (types, titles, addresses, icons); folders deeper than 3 levels are
 * left to valider(), which flattens them. */
function verifierElements(elements, profondeur = 0) {
  if (!Array.isArray(elements)) throw new ErreurImport("contenu de dossier invalide");
  if (profondeur > BORNE) throw new ErreurImport("dossiers imbriqués trop profondément");
  for (const e of elements) {
    if (!e || typeof e !== "object") throw new ErreurImport("élément invalide");
    if (typeof e.id !== "string" || !e.id) throw new ErreurImport("identifiant manquant", e.titre);
    if (e.type !== "site" && e.type !== "dossier") {
      throw new ErreurImport(`type d'élément inconnu « ${e.type} »`, e.type);
    }
    if (typeof e.titre !== "string") throw new ErreurImport("titre manquant", e.id);
    if (e.titre.length > TITRE_MAX) {
      throw new ErreurImport(`titre trop long (${TITRE_MAX} caractères au plus)`, e.titre);
    }
    if (e.type === "site") {
      const url = normaliserUrl(e.url);
      if (!url.ok) {
        const schema = String(e.url ?? "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
        throw new ErreurImport(`adresse refusée${schema ? ` (${schema}:)` : ""}`, e.url);
      }
      verifierIcone(e.icone, e.titre);
    } else {
      verifierElements(e.items, profondeur + 1);
    }
  }
}

/** True when a folder sits at level 3 or deeper (it will be flattened). */
function tropProfond(elements, niveau = 0) {
  return elements.some(
    (e) => e.type === "dossier" && (niveau >= PROFONDEUR_MAX || tropProfond(e.items, niveau + 1)),
  );
}

/**
 * @param {string} texte content of the file (UTF-8; a BOM is removed)
 * @returns {{ ok: true, etat: object, sauvegardes: number, aplati: boolean, exporteLe: string|null }
 *         | { ok: false, erreur: string }}
 */
export function validerImport(texte) {
  // A BOM (added by some editors) is removed.
  const brut = String(texte ?? "");
  const source = brut.charCodeAt(0) === 0xfeff ? brut.slice(1) : brut;
  let objet;
  try {
    objet = JSON.parse(source);
  } catch {
    return {
      ok: false,
      erreur: "Ce fichier n'est pas un export NedoTab lisible (JSON invalide ou tronqué).",
    };
  }
  if (!objet || typeof objet !== "object" || objet.format !== FORMAT_EXPORT) {
    return { ok: false, erreur: "Ce fichier n'est pas un export NedoTab." };
  }
  if (!Number.isInteger(objet.versionSchema) || objet.versionSchema < 1) {
    return { ok: false, erreur: "Version de données inconnue dans ce fichier." };
  }
  if (objet.versionSchema > VERSION_SCHEMA) {
    return {
      ok: false,
      erreur: "Ce fichier vient d'une version plus récente de NedoTab : mettez NedoTab à jour.",
    };
  }
  if (!Array.isArray(objet.grille)) return { ok: false, erreur: "Aucune grille dans ce fichier." };
  try {
    verifierElements(objet.grille);
  } catch (e) {
    if (!(e instanceof ErreurImport)) throw e;
    const ligne = ligneDe(source, e.valeur);
    const message = e.message.charAt(0).toUpperCase() + e.message.slice(1);
    return { ok: false, erreur: ligne ? `Ligne ${ligne} : ${e.message}.` : `${message}.` };
  }
  const aplati = tropProfond(objet.grille);
  const { etat } = migrer({
    versionSchema: objet.versionSchema,
    grille: objet.grille,
    reglages: objet.reglages,
  });
  if (estimerTaille(etat) >= SEUIL_BLOCAGE) {
    return { ok: false, erreur: "Ce fichier est trop volumineux pour un compte (950 Ko au plus)." };
  }
  return {
    ok: true,
    etat: { versionSchema: objet.versionSchema, grille: etat.grille, reglages: etat.reglages },
    sauvegardes: Array.isArray(objet.sauvegardes) ? objet.sauvegardes.length : 0,
    aplati,
    exporteLe: typeof objet.exporteLe === "string" ? objet.exporteLe : null,
  };
}

/** Same grid with every id replaced (merge: no collision with the current grid). */
export function nouveauxIds(grille, genererId) {
  return grille.map((e) =>
    e.type === "dossier"
      ? { ...e, id: genererId(), items: nouveauxIds(e.items, genererId) }
      : { ...e, id: genererId() },
  );
}

/**
 * "Fusionner": the imported sites not already present go into a folder "Importé le
 * JJ/MM/AAAA" at the end, with new ids. Returns the action to send (deterministic: replay
 * safe), or null when everything is already there.
 */
export function actionFusion(grilleActuelle, grilleImportee, { genererId, maintenant }) {
  const { dossier, ajoutes, aplati } = dossierImporte(
    grilleActuelle,
    nouveauxIds(grilleImportee, genererId),
    { dossierId: genererId(), titre: `Importé le ${dateCourte(maintenant)}`, maintenant },
  );
  if (!dossier) return { action: null, ajoutes: 0, aplati: false };
  return {
    action: { type: "DOSSIER_CREER", dossier, parentId: null, idsAInclure: [] },
    ajoutes,
    aplati,
  };
}
