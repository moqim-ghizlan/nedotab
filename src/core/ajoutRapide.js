/**
 * Quick add from the toolbar button (V4.29). Pure: no DOM, no chrome.*, no Firebase.
 */
import { PROFONDEUR_MAX } from "./constantes.js";
import { trouver } from "./arbre.js";
import { cleUrl, normaliserUrl } from "./url.js";

const HOTES_REFUSES = ["chromewebstore.google.com", "chrome.google.com"];

/**
 * Reads the active tab, once, when the window opens. Only http(s) pages can be added:
 * chrome://, the Web Store, the new-tab page, file:// are refused with an explanation.
 * @returns {{ ok: true, url: string, titre: string } | { ok: false, raison: string }}
 */
export function lireOnglet({ url, titre } = {}) {
  const brut = String(url ?? "");
  if (!/^https?:\/\//i.test(brut))
    return {
      ok: false,
      raison: "Cette page ne peut pas être ajoutée (seules les pages http et https le peuvent).",
    };
  const r = normaliserUrl(brut);
  if (!r.ok) return { ok: false, raison: r.erreur };
  const hote = new URL(r.url).hostname;
  if (HOTES_REFUSES.includes(hote) && /\/webstore|^https:\/\/chromewebstore/i.test(r.url))
    return { ok: false, raison: "Le Chrome Web Store ne peut pas être ajouté depuis ce bouton." };
  return {
    ok: true,
    url: r.url,
    titre: String(titre ?? "")
      .trim()
      .slice(0, 60),
  };
}

/**
 * Flat list of the places a site can go: { id, chemin: "Travail › Clients", niveau }.
 * Home is { id: null, niveau: 0 }. Folders deeper than the 3-level limit are left out.
 */
export function dossiersCibles(grille) {
  const liste = [{ id: null, chemin: "Accueil", niveau: 0 }];
  const visiter = (items, chemin, niveau) => {
    for (const e of items ?? []) {
      if (e?.type !== "dossier" || niveau >= PROFONDEUR_MAX) continue;
      const ici = [...chemin, e.titre];
      liste.push({ id: e.id, chemin: ici.join(" › "), niveau: niveau + 1 });
      visiter(e.items, ici, niveau + 1);
    }
  };
  visiter(grille, [], 0);
  return liste;
}

/** The folder id when it still exists, null (Accueil) otherwise. */
export function emplacementValide(grille, id) {
  if (id == null) return null;
  const r = trouver(grille, id);
  return r?.element.type === "dossier" ? id : null;
}

/** The site already saved with this address, with where it is. */
export function siteExistant(grille, url) {
  const cle = cleUrl(url);
  const chercher = (items, chemin) => {
    for (const e of items ?? []) {
      if (e.type === "site" && cleUrl(e.url) === cle)
        return { site: e, chemin: chemin.join(" › ") || "Accueil" };
      if (e.type === "dossier") {
        const r = chercher(e.items, [...chemin, e.titre]);
        if (r) return r;
      }
    }
    return null;
  };
  return chercher(grille, []);
}

/**
 * Applies an AI proposal WITHOUT overwriting what the user typed or changed.
 * @param {{ titre: string, tags: string[], description: string, dossierId: string|null }} formulaire
 * @param {{ titre?: string, tags?: string[], description?: string, dossier?: string }} proposition
 * @param {Set<string>|string[]} champsTouches names among titre, tags, description, dossier
 * @returns {{ formulaire: object, remplis: string[] }}
 */
export function fusionnerPropositionIa(formulaire, proposition, champsTouches, grille = null) {
  const touches = new Set(champsTouches);
  const sortie = { ...formulaire };
  const remplis = [];
  const mettre = (champ, valeur, cle = champ) => {
    if (touches.has(champ) || valeur === undefined) return;
    sortie[cle] = valeur;
    remplis.push(champ);
  };
  mettre("titre", proposition.titre);
  mettre("tags", proposition.tags);
  mettre("description", proposition.description);
  if (proposition.dossier !== undefined) {
    const id = proposition.dossier === "accueil" ? null : proposition.dossier;
    mettre("dossier", grille ? emplacementValide(grille, id) : id, "dossierId");
  }
  return { formulaire: sortie, remplis };
}

/** Size limits of the add window (T4), in px. */
export const FENETRE_AJOUT = { largeurMin: 640, largeurMax: 1100, hauteurMin: 480, hauteurMax: 800 };

/**
 * Size and place of the add window: 75 % of the usable screen, within the limits above (and
 * never larger than the screen), centred. `ecran` = { largeur, hauteur, gauche?, haut? }.
 */
export function dimensionsFenetreAjout(ecran, part = 0.75) {
  const L = Number.isFinite(ecran?.largeur) && ecran.largeur > 0 ? ecran.largeur : 1280;
  const H = Number.isFinite(ecran?.hauteur) && ecran.hauteur > 0 ? ecran.hauteur : 800;
  const borne = (v, min, max, plafond) => Math.min(plafond, Math.max(min, Math.min(max, v)));
  const width = Math.round(borne(L * part, FENETRE_AJOUT.largeurMin, FENETRE_AJOUT.largeurMax, L));
  const height = Math.round(
    borne(H * part, FENETRE_AJOUT.hauteurMin, FENETRE_AJOUT.hauteurMax, H),
  );
  return {
    width,
    height,
    left: Math.round((ecran?.gauche ?? 0) + (L - width) / 2),
    top: Math.round((ecran?.haut ?? 0) + (H - height) / 2),
  };
}
