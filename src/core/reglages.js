/**
 * Settings: theme, background and how sites open. Pure validation, shared by the reducer and
 * the loader.
 *
 * fond: { type: "aucun" }
 *     | { type: "couleur", valeur: "#1e293b" }
 *     | { type: "degrade", valeur: "aurore" }            (name of a built-in gradient)
 *     | { type: "image", ref: "local:<id>", dominante: "#334455", voile: 0.25, flou: 0 }
 *     | { type: "galerie", id: "photo-…", voile, flou }                       (V2.13)
 *     | { type: "aleatoire", categorie, frequence: "onglet"|"jour"|"clic", choix?, voile, flou }
 */
import { estCategorie, estIdPhoto, FREQUENCES } from "./galerie.js";
import { reglesAStocker } from "./domainesVpn.js";
import { frequentsAStocker } from "./frequents.js";
import { iaAStocker, validerIa } from "./ia.js";
import { NAVIGATEURS } from "./navigateurs.js";
import { capaciteDe, comptesAStocker, normaliserComptes, validerGrilleAccueil } from "./pages.js";

export const THEMES = ["auto", "clair", "sombre"];
export const NOMS_DEGRADES = [
  "aurore",
  "lagon",
  "foret",
  "crepuscule",
  "brume",
  "ardoise",
  "sable",
  "nuit",
];
export const VOILE_MAX = 0.7;
export const FLOU_MAX = 20;

const HEX = /^#[0-9a-f]{6}$/i;
export const estCouleurHex = (v) => typeof v === "string" && HEX.test(v);

const borner = (n, min, max) => Math.min(max, Math.max(min, Number(n)));

/** Account backgrounds library (V2.6): at most 10 pictures in Storage. */
export const FONDS_MAX = 10;
export const TAILLE_FOND_MAX = 5 * 1024 * 1024;
const ID_FOND = /^[A-Za-z0-9_-]{1,64}$/;

/** A library entry: { id, chemin, dominante, largeur, hauteur, taille, ajouteLe }, or null. */
export function validerEntreeFond(e) {
  if (!e || typeof e !== "object" || typeof e.id !== "string" || !ID_FOND.test(e.id)) return null;
  if (typeof e.chemin !== "string" || !/^users\/[^/]+\/fonds\/[^/]+$/.test(e.chemin)) return null;
  const entier = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    id: e.id,
    chemin: e.chemin,
    dominante: estCouleurHex(e.dominante) ? e.dominante.toLowerCase() : "#808080",
    largeur: entier(e.largeur),
    hauteur: entier(e.hauteur),
    taille: entier(e.taille),
    ajouteLe: entier(e.ajouteLe),
  };
}

/** Valid library: entries kept in order, duplicates and extra ones dropped. */
export function validerFonds(liste) {
  const vus = new Set();
  const resultat = [];
  for (const e of Array.isArray(liste) ? liste : []) {
    const v = validerEntreeFond(e);
    if (v && !vus.has(v.id) && resultat.length < FONDS_MAX) {
      vus.add(v.id);
      resultat.push(v);
    }
  }
  return resultat;
}

/** Cache keys of pictures that are no longer in the library (to purge). */
export function fondsAPurger(idsEnCache, reglages) {
  const garder = new Set((reglages?.fonds ?? []).map((f) => f.id));
  return idsEnCache.filter((id) => !garder.has(id));
}

/** Veil and blur of a picture background, or null when they are not numbers. */
function effetsImage(fond) {
  if (!Number.isFinite(Number(fond.voile ?? 0)) || !Number.isFinite(Number(fond.flou ?? 0))) {
    return null;
  }
  return {
    voile: borner(fond.voile ?? 0.25, 0, VOILE_MAX),
    flou: Math.round(borner(fond.flou ?? 0, 0, FLOU_MAX)),
  };
}

/** Returns a valid background, or null when `fond` cannot be accepted. */
export function validerFond(fond) {
  if (!fond || typeof fond !== "object") return null;
  switch (fond.type) {
    case "galerie": {
      // A photo of the gallery (V2.13), synced; its address comes from its key.
      const effets = effetsImage(fond);
      return effets && estIdPhoto(fond.id) ? { type: "galerie", id: fond.id, ...effets } : null;
    }
    case "aleatoire": {
      // A photo drawn at random in a category: each tab, each day, or on request (V2.13).
      const effets = effetsImage(fond);
      if (!effets || !estCategorie(fond.categorie) || !FREQUENCES.includes(fond.frequence))
        return null;
      return {
        type: "aleatoire",
        categorie: fond.categorie,
        frequence: fond.frequence,
        ...(fond.frequence === "clic" && estIdPhoto(fond.choix) ? { choix: fond.choix } : {}),
        ...effets,
      };
    }
    case "aucun":
      return { type: "aucun" };
    case "couleur":
      return estCouleurHex(fond.valeur)
        ? { type: "couleur", valeur: fond.valeur.toLowerCase() }
        : null;
    case "degrade":
      return NOMS_DEGRADES.includes(fond.valeur) ? { type: "degrade", valeur: fond.valeur } : null;
    case "image": {
      const effets = effetsImage(fond);
      if (!effets) return null;
      // Picture of the account's library (V2.6): synced, the file is in Storage.
      if (typeof fond.id === "string" && ID_FOND.test(fond.id)) {
        return { type: "image", id: fond.id, ...effets };
      }
      // Picture of this device only (V1.9): IndexedDB, never synced.
      if (typeof fond.ref !== "string" || !fond.ref.startsWith("local:")) return null;
      return {
        type: "image",
        ref: fond.ref,
        dominante: estCouleurHex(fond.dominante) ? fond.dominante.toLowerCase() : "#808080",
        ...effets,
      };
    }
    default:
      return null;
  }
}

/**
 * Synced on/off settings, all off by default and stored only when on (settings saved before
 * one existed stay unchanged): nouvelOnglet opens the grid's sites in a new tab (V2.10.3),
 * rechercheNouvelOnglet the web searches of the search bar (V2.10.6), gardeDossierOuvert stops a
 * click outside a folder window from closing it (V4.5.1), animationsReduites turns off the
 * animations and transitions (V4.5.2), masquerRecherche hides the search bar (V4.5.3), masquerTitres the
 * titles under the icons (V4.5.4), confirmerSuppression asks before deleting a site or an empty
 * folder (V4.5.5).
 */
export const INTERRUPTEURS = [
  "nouvelOnglet",
  "rechercheNouvelOnglet",
  "gardeDossierOuvert",
  "animationsReduites",
  "masquerRecherche",
  "masquerTitres",
  "confirmerSuppression",
  // V4.21: tracking of the opened sites is ON by default; these store the opt-out.
  "sansSuiviUsage",
  "sansUsagePourIa",
  // T8: the sharing space is ON by default; this stores the opt-out.
  "sansEspacePartage",
];

/**
 * Applies `changements` (whitelisted keys: theme, fond, grilleAccueil, ia and the INTERRUPTEURS)
 * to `reglages`. Unknown keys and invalid values are refused: the same object is returned.
 * pagesAccueil is never changed here: the reducer keeps it in line with the grid.
 */
export function modifierReglages(reglages, changements) {
  if (!changements || typeof changements !== "object") return reglages;
  const cles = Object.keys(changements);
  const permises = ["theme", "fond", "grilleAccueil", "ia", "frequents", "vpn", ...INTERRUPTEURS];
  if (cles.length === 0 || cles.some((c) => !permises.includes(c))) return reglages;
  const suivant = { ...reglages };
  if ("theme" in changements) {
    if (!THEMES.includes(changements.theme)) return reglages;
    suivant.theme = changements.theme;
  }
  if ("fond" in changements) {
    const fond = validerFond(changements.fond);
    if (!fond) return reglages;
    suivant.fond = fond;
  }
  if ("grilleAccueil" in changements) {
    // V2.12: lignes × colonnes of the home pages, the same on every device.
    const g = validerGrilleAccueil(changements.grilleAccueil);
    if (!g) return reglages;
    suivant.grilleAccueil = g;
  }
  if ("ia" in changements) {
    // V4.1: AI settings (on/off, model of each use, custom models), synced. No key in them.
    if (!changements.ia || typeof changements.ia !== "object") return reglages;
    const ia = iaAStocker(validerIa(changements.ia));
    if (ia) suivant.ia = ia;
    else delete suivant.ia;
    if (JSON.stringify(suivant.ia) === JSON.stringify(reglages.ia) && cles.length === 1)
      return reglages;
  }
  if ("frequents" in changements) {
    // V4.22: row "Les plus utilisés" (shown, title, hidden ids: 200 at most), synced.
    const f = changements.frequents;
    if (!f || typeof f !== "object" || (Array.isArray(f.masques) && f.masques.length > 200))
      return reglages;
    const stocke = frequentsAStocker(f);
    if (stocke) suivant.frequents = stocke;
    else delete suivant.frequents;
    if (
      JSON.stringify(suivant.frequents) === JSON.stringify(reglages.frequents) &&
      cles.length === 1
    )
      return reglages;
  }
  if ("vpn" in changements) {
    // V5.6: per-site rules of the VPN (mode and two lists, 200 each), synced. No identifier.
    const v = changements.vpn;
    if (!v || typeof v !== "object") return reglages;
    const stocke = reglesAStocker(v);
    if (stocke) suivant.vpn = stocke;
    else delete suivant.vpn;
    if (JSON.stringify(suivant.vpn) === JSON.stringify(reglages.vpn) && cles.length === 1)
      return reglages;
  }
  for (const cle of INTERRUPTEURS.filter((c) => c in changements)) {
    if (typeof changements[cle] !== "boolean") return reglages;
    if (changements[cle]) suivant[cle] = true;
    else delete suivant[cle];
  }
  // A switch set to the value it already has changes nothing.
  if (cles.every((c) => INTERRUPTEURS.includes(c) && changements[c] === !!reglages[c]))
    return reglages;
  return suivant;
}

/**
 * Settings read from storage: anything invalid falls back to the defaults. The home pages
 * (pagesAccueil) are checked against the grid by avecPagesValides, once both are known.
 */
export function validerReglages(reglages) {
  const r = reglages && typeof reglages === "object" ? reglages : {};
  const fonds = validerFonds(r.fonds);
  let fond = validerFond(r.fond) ?? { type: "aucun" };
  // A synced picture must be in the library; a device-only picture is never synced.
  if (fond.type === "image" && (fond.ref || !fonds.some((f) => f.id === fond.id))) {
    fond = { type: "aucun" };
  }
  const resultat = { ...r, theme: THEMES.includes(r.theme) ? r.theme : "auto", fond, fonds };
  for (const cle of INTERRUPTEURS) if (resultat[cle] !== true) delete resultat[cle];
  const ia = iaAStocker(r.ia);
  if (ia) resultat.ia = ia;
  else delete resultat.ia;
  const frequents = frequentsAStocker(r.frequents);
  if (frequents) resultat.frequents = frequents;
  else delete resultat.frequents;
  const vpn = reglesAStocker(r.vpn);
  if (vpn) resultat.vpn = vpn;
  else delete resultat.vpn;
  const grille = validerGrilleAccueil(r.grilleAccueil);
  if (grille) resultat.grilleAccueil = grille;
  else delete resultat.grilleAccueil;
  return resultat;
}

/** Home page sizes made valid for a home list of `n` elements (V2.12). */
export function avecPagesValides(reglages, n) {
  const capacite = capaciteDe(reglages);
  const comptes = comptesAStocker(
    normaliserComptes(reglages.pagesAccueil ?? null, n, capacite),
    n,
    capacite,
  );
  const resultat = { ...reglages };
  if (comptes) resultat.pagesAccueil = comptes;
  else delete resultat.pagesAccueil;
  return resultat;
}

/** Forced number of columns of the home grid on this device (null: automatic). */
export const COLONNES_MIN = 3;
export const COLONNES_MAX = 10;
const colonnesValides = (n) => Number.isInteger(n) && n >= COLONNES_MIN && n <= COLONNES_MAX;

/** Size of the tiles on this device, in % of the natural size (100 = default). */
export const TAILLE_TUILES_MIN = 60;
export const TAILLE_TUILES_MAX = 200;
export const TAILLE_TUILES_DEFAUT = 100;
const tailleTuilesValide = (n) =>
  Number.isInteger(n) && n >= TAILLE_TUILES_MIN && n <= TAILLE_TUILES_MAX;

/** Settings of this device only, never synced (V2.9). */
export const CLES_APPAREIL = [
  "colonnes",
  "debug",
  "barreChrome",
  "affichageAccueil",
  "navigateur",
  "tailleTuiles",
  "animationPage",
  "animationDossier",
  "retourHaptique",
  "formeIcones",
  "espacement",
  "affichageHeure",
  "tailleTitres",
  "ombreIcones",
  "styleDossier",
  "opaciteDossier",
];

/** Animation played when the home changes page (prototypes): slide by default, then not stored. */
export const ANIMATIONS_PAGE = ["glisse", "fondu", "zoom", "cube", "ressort"];

/** Animation of the page change on this device. */
export function animationPageDe(reglagesAppareil) {
  const choisie = reglagesAppareil?.animationPage;
  return ANIMATIONS_PAGE.includes(choisie) ? choisie : "glisse";
}

/** Animation of the folder window, opening and going into a sub-folder (prototypes): zoom by default. */
export const ANIMATIONS_DOSSIER = ["zoom", "fondu", "bas", "rebond", "bascule"];

/** Animation of the folder window on this device. */
export function animationDossierDe(reglagesAppareil) {
  const choisie = reglagesAppareil?.animationDossier;
  return ANIMATIONS_DOSSIER.includes(choisie) ? choisie : "zoom";
}

/** How the home grid is shown on this device (V2.11): pages by default, or one scrolling grid. */
export const AFFICHAGES_ACCUEIL = ["pages", "defilement"];

/** Shape of the icons on this device (V4.5.7): rounded by default, then not stored. */
export const FORMES_ICONES = ["carre", "arrondi", "rond"];

export function formeIconesDe(reglagesAppareil) {
  const choisie = reglagesAppareil?.formeIcones;
  return FORMES_ICONES.includes(choisie) ? choisie : "arrondi";
}

/** Space between the tiles on this device (V4.5.8): normal by default, then not stored. */
export const ESPACEMENTS = ["serre", "normal", "large"];

export function espacementDe(reglagesAppareil) {
  const choisi = reglagesAppareil?.espacement;
  return ESPACEMENTS.includes(choisi) ? choisi : "normal";
}

/** Heure et date (V4.5.9): "aucun" by default, then not stored. */
export const AFFICHAGES_HEURE = ["aucun", "24h", "12h"];

export function affichageHeureDe(reglagesAppareil) {
  const choisi = reglagesAppareil?.affichageHeure;
  return AFFICHAGES_HEURE.includes(choisi) ? choisi : "aucun";
}

/** Taille du texte des titres (V4.5.10), in %: 100 = default, then not stored. */
export const TAILLETITRES_MIN = 80;
export const TAILLETITRES_MAX = 160;
export const TAILLETITRES_DEFAUT = 100;
const tailleTitresValide = (n) =>
  Number.isInteger(n) && n >= TAILLETITRES_MIN && n <= TAILLETITRES_MAX;

/** Ombre sous les icônes (V4.5.11): "legere" by default, then not stored. */
export const OMBRES_ICONES = ["aucune", "legere", "forte"];

export function ombreIconesDe(reglagesAppareil) {
  const choisi = reglagesAppareil?.ombreIcones;
  return OMBRES_ICONES.includes(choisi) ? choisi : "legere";
}

/** Style des dossiers (V4.5.12): "apercu" by default, then not stored. */
export const STYLES_DOSSIER = ["apercu", "icone"];

export function styleDossierDe(reglagesAppareil) {
  const choisi = reglagesAppareil?.styleDossier;
  return STYLES_DOSSIER.includes(choisi) ? choisi : "apercu";
}

/** Opacité de la fenêtre de dossier (V4.5.13), in %: 100 = default, then not stored. */
export const OPACITEDOSSIER_MIN = 60;
export const OPACITEDOSSIER_MAX = 100;
export const OPACITEDOSSIER_DEFAUT = 100;
const opaciteDossierValide = (n) =>
  Number.isInteger(n) && n >= OPACITEDOSSIER_MIN && n <= OPACITEDOSSIER_MAX;

/** Below this shorter screen side (CSS px), the device is a phone (V3.4). */
export const COTE_TELEPHONE = 600;

/** Home display of this device: the one chosen in the settings, else pages. */
export function affichageAccueilDe(reglagesAppareil) {
  const choisi = reglagesAppareil?.affichageAccueil;
  return AFFICHAGES_ACCUEIL.includes(choisi) ? choisi : "pages";
}

/**
 * Device-only settings: local picture background, forced columns, debug log, barreChrome
 * (V2.10.7: leave the cursor in Chrome's address bar on a new tab, instead of the search) and
 * affichageAccueil (V2.11; V3.4: stored once chosen, pages by default) and navigateur
 * (browser that opens the sites on iOS, Safari by default
 * and then not stored).
 */
export function validerReglagesAppareil(r) {
  const resultat = {};
  const fond = validerFond(r?.fond);
  if (fond?.type === "image" && fond.ref) resultat.fond = fond;
  if (colonnesValides(r?.colonnes)) resultat.colonnes = r.colonnes;
  if (tailleTuilesValide(r?.tailleTuiles) && r.tailleTuiles !== TAILLE_TUILES_DEFAUT)
    resultat.tailleTuiles = r.tailleTuiles;
  if (r?.retourHaptique === true) resultat.retourHaptique = true;
  if (FORMES_ICONES.includes(r?.formeIcones) && r.formeIcones !== "arrondi")
    resultat.formeIcones = r.formeIcones;
  if (ESPACEMENTS.includes(r?.espacement) && r.espacement !== "normal")
    resultat.espacement = r.espacement;
  if (AFFICHAGES_HEURE.includes(r?.affichageHeure) && r.affichageHeure !== "aucun")
    resultat.affichageHeure = r.affichageHeure;
  if (tailleTitresValide(r?.tailleTitres) && r.tailleTitres !== TAILLETITRES_DEFAUT)
    resultat.tailleTitres = r.tailleTitres;
  if (OMBRES_ICONES.includes(r?.ombreIcones) && r.ombreIcones !== "legere")
    resultat.ombreIcones = r.ombreIcones;
  if (STYLES_DOSSIER.includes(r?.styleDossier) && r.styleDossier !== "apercu")
    resultat.styleDossier = r.styleDossier;
  if (opaciteDossierValide(r?.opaciteDossier) && r.opaciteDossier !== OPACITEDOSSIER_DEFAUT)
    resultat.opaciteDossier = r.opaciteDossier;
  if (r?.debug === true) resultat.debug = true;
  if (r?.barreChrome === true) resultat.barreChrome = true;
  if (AFFICHAGES_ACCUEIL.includes(r?.affichageAccueil))
    resultat.affichageAccueil = r.affichageAccueil;
  if (ANIMATIONS_DOSSIER.includes(r?.animationDossier) && r.animationDossier !== "zoom")
    resultat.animationDossier = r.animationDossier;
  if (NAVIGATEURS.includes(r?.navigateur) && r.navigateur !== "safari")
    resultat.navigateur = r.navigateur;
  if (ANIMATIONS_PAGE.includes(r?.animationPage) && r.animationPage !== "glisse")
    resultat.animationPage = r.animationPage;
  return resultat;
}

/**
 * Applies device-only changes (colonnes: null = automatic, debug and barreChrome: boolean,
 * affichageAccueil: "pages" | "defilement", navigateur: one of NAVIGATEURS).
 */
function modifierAppareil(etat, changements) {
  const appareil = { ...etat.reglagesAppareil };
  if ("colonnes" in changements) {
    if (changements.colonnes == null) delete appareil.colonnes;
    else if (colonnesValides(changements.colonnes)) appareil.colonnes = changements.colonnes;
    else return etat;
  }
  if ("tailleTuiles" in changements) {
    const t = changements.tailleTuiles;
    if (t == null || t === TAILLE_TUILES_DEFAUT) delete appareil.tailleTuiles;
    else if (tailleTuilesValide(t)) appareil.tailleTuiles = t;
    else return etat;
  }
  if ("formeIcones" in changements) {
    if (!FORMES_ICONES.includes(changements.formeIcones)) return etat;
    if (changements.formeIcones === "arrondi") delete appareil.formeIcones;
    else appareil.formeIcones = changements.formeIcones;
  }
  if ("espacement" in changements) {
    if (!ESPACEMENTS.includes(changements.espacement)) return etat;
    if (changements.espacement === "normal") delete appareil.espacement;
    else appareil.espacement = changements.espacement;
  }
  if ("affichageHeure" in changements) {
    if (!AFFICHAGES_HEURE.includes(changements.affichageHeure)) return etat;
    if (changements.affichageHeure === "aucun") delete appareil.affichageHeure;
    else appareil.affichageHeure = changements.affichageHeure;
  }
  if ("tailleTitres" in changements) {
    const t = changements.tailleTitres;
    if (t == null || t === TAILLETITRES_DEFAUT) delete appareil.tailleTitres;
    else if (tailleTitresValide(t)) appareil.tailleTitres = t;
    else return etat;
  }
  if ("ombreIcones" in changements) {
    if (!OMBRES_ICONES.includes(changements.ombreIcones)) return etat;
    if (changements.ombreIcones === "legere") delete appareil.ombreIcones;
    else appareil.ombreIcones = changements.ombreIcones;
  }
  if ("styleDossier" in changements) {
    if (!STYLES_DOSSIER.includes(changements.styleDossier)) return etat;
    if (changements.styleDossier === "apercu") delete appareil.styleDossier;
    else appareil.styleDossier = changements.styleDossier;
  }
  if ("opaciteDossier" in changements) {
    const t = changements.opaciteDossier;
    if (t == null || t === OPACITEDOSSIER_DEFAUT) delete appareil.opaciteDossier;
    else if (opaciteDossierValide(t)) appareil.opaciteDossier = t;
    else return etat;
  }
  if ("affichageAccueil" in changements) {
    if (changements.affichageAccueil == null) delete appareil.affichageAccueil;
    else if (AFFICHAGES_ACCUEIL.includes(changements.affichageAccueil))
      appareil.affichageAccueil = changements.affichageAccueil;
    else return etat;
  }
  if ("animationPage" in changements) {
    if (!ANIMATIONS_PAGE.includes(changements.animationPage)) return etat;
    if (changements.animationPage === "glisse") delete appareil.animationPage;
    else appareil.animationPage = changements.animationPage;
  }
  if ("animationDossier" in changements) {
    if (!ANIMATIONS_DOSSIER.includes(changements.animationDossier)) return etat;
    if (changements.animationDossier === "zoom") delete appareil.animationDossier;
    else appareil.animationDossier = changements.animationDossier;
  }
  if ("navigateur" in changements) {
    if (!NAVIGATEURS.includes(changements.navigateur)) return etat;
    if (changements.navigateur === "safari") delete appareil.navigateur;
    else appareil.navigateur = changements.navigateur;
  }
  for (const cle of ["debug", "barreChrome", "retourHaptique"].filter((c) => c in changements)) {
    if (changements[cle]) appareil[cle] = true;
    else delete appareil[cle];
  }
  return JSON.stringify(appareil) === JSON.stringify(etat.reglagesAppareil ?? {})
    ? etat
    : { ...etat, reglagesAppareil: appareil };
}

/**
 * Background shown on this device: the local picture if any (it has priority), else the
 * synced one. A library picture gets its dominant colour and Storage path from the library.
 */
export function fondEffectif(etat) {
  const fond = etat.reglagesAppareil?.fond ?? etat.reglages.fond;
  if (fond?.type !== "image" || !fond.id) return fond;
  const entree = (etat.reglages.fonds ?? []).find((f) => f.id === fond.id);
  return entree
    ? { ...fond, dominante: entree.dominante, chemin: entree.chemin }
    : { type: "aucun" };
}

/**
 * REGLAGES_MODIFIER on the whole state: a picture background is device-only
 * (reglagesAppareil); any other background is synced and replaces the local picture.
 */
export function modifierReglagesEtat(etat, changements) {
  const cles = Object.keys(changements ?? {});
  if (cles.length && cles.every((c) => CLES_APPAREIL.includes(c))) {
    return modifierAppareil(etat, changements);
  }
  if (cles.some((c) => CLES_APPAREIL.includes(c))) return etat; // never mixed with synced ones
  const fond = changements?.fond;
  if (fond?.type === "image" && fond.id) {
    // A library picture is synced; it replaces a device-only picture on this device.
    if (!(etat.reglages.fonds ?? []).some((f) => f.id === fond.id)) return etat;
  } else if (fond?.type === "image") {
    const autres = { ...changements };
    delete autres.fond;
    const valide = validerFond(fond);
    if (!valide) return etat;
    const reglages = Object.keys(autres).length
      ? modifierReglages(etat.reglages, autres)
      : etat.reglages;
    if (Object.keys(autres).length && reglages === etat.reglages) return etat;
    return { ...etat, reglages, reglagesAppareil: { ...etat.reglagesAppareil, fond: valide } };
  }
  const reglages = modifierReglages(etat.reglages, changements);
  if (reglages === etat.reglages) return etat;
  const suivant = { ...etat, reglages };
  if (fond && etat.reglagesAppareil?.fond) {
    const appareil = { ...etat.reglagesAppareil };
    delete appareil.fond;
    suivant.reglagesAppareil = appareil;
  }
  return suivant;
}
