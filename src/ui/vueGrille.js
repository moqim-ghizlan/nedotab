import { A } from "../core/actions.js";
import { peutCreerDossierDans, peutPlacer, trouver } from "../core/arbre.js";
import { genererIdParDefaut } from "../core/modele.js";
import { brancherActionsElements } from "./actionsElement.js";
import { activerDeplacementClavier, activerGlisser } from "./glisser.js";
import { activerClavierGrille, colonnes, rendreGrille } from "./grille.js";
import { creerIntentionDepot } from "./intentionDepot.js";
import { RAISONS } from "./messages.js";
import { toast } from "./toast.js";

/** After a site + site drop, open the new folder with its title ready to be typed. */
export const OUVRIR_APRES_FUSION = true;

/**
 * One grid level, shared by the home page and the folder window: rendering, drag and drop
 * (reorder, drop into a folder, site + site → folder, breadcrumb), keyboard, context menus.
 * `parentId()` gives the folder shown (null = home).
 */
export function creerVueGrille({
  store,
  conteneur,
  parentId = () => null,
  lectureSeule = () => false,
  annoncer = () => {},
  ouvrirDossier,
  apresFusion,
  ajouter,
  libelleAjout,
}) {
  const grille = () => store.lire().grille;
  const elements = () => {
    const id = parentId();
    if (id == null) return grille();
    const r = trouver(grille(), id);
    return r?.element.type === "dossier" ? r.element.items : null;
  };

  const rendre = () => {
    const liste = elements();
    if (!liste) return;
    // The level is rebuilt: remember which tile had the focus and give it back.
    const actif = conteneur.contains(document.activeElement)
      ? document.activeElement.closest("[data-id], [data-action]")
      : null;
    const cle = actif?.dataset.id ?? actif?.dataset.action;
    rendreGrille(conteneur, liste, { avecAjout: !lectureSeule(), libelleAjout });
    if (cle) {
      conteneur
        .querySelector(`.tuile[data-id="${CSS.escape(cle)}"], [data-action="${CSS.escape(cle)}"]`)
        ?.focus();
    }
  };

  /** Runs `action`, then offers "Annuler" that puts the whole grid back. */
  const avecAnnulation = (message, action) => {
    const avant = grille();
    store.envoyer(action);
    if (grille() === avant) return false;
    toast(message, {
      action: {
        libelle: "Annuler",
        onClic: () => store.envoyer({ type: A.GRILLE_REMPLACER, grille: avant }),
      },
    });
    return true;
  };

  // --- drop targets ------------------------------------------------------------------------
  let sourceCourante = null;
  const evaluer = (cible) => {
    const g = grille();
    const source = trouver(g, sourceCourante);
    if (!source) return { ok: false, raison: "INTROUVABLE" };
    if (cible.type === "niveau") {
      // The level the element is already in is not a target.
      if ((source.parent?.id ?? null) === cible.id) return { ignorer: true };
      return peutPlacer(g, sourceCourante, cible.id);
    }
    const c = trouver(g, cible.id);
    if (!c) return { ok: false, raison: "INTROUVABLE" };
    if (c.element.type === "dossier") return peutPlacer(g, sourceCourante, cible.id);
    if (source.element.type === "dossier") return { ok: false, raison: "DOSSIER_SUR_SITE" };
    return peutCreerDossierDans(g, c.parent?.id ?? null)
      ? { ok: true }
      : { ok: false, raison: "PROFONDEUR" };
  };
  const intention = creerIntentionDepot({ evaluer });
  const intentionAvecSource = {
    ...intention,
    demarrer: (id) => {
      sourceCourante = id;
      intention.demarrer(id);
    },
  };

  const deposer = (id, cible) => {
    sourceCourante = null;
    if (!cible.ok) {
      toast(RAISONS[cible.raison] ?? "Déplacement impossible", { type: "erreur", duree: 4000 });
      return;
    }
    const g = grille();
    const source = trouver(g, id)?.element;
    if (cible.type === "niveau") {
      const nom = cible.id == null ? "Accueil" : trouver(g, cible.id)?.element.titre;
      avecAnnulation(`Déplacé dans ${nom}`, {
        type: A.ELEMENT_DEPLACER,
        id,
        versParentId: cible.id,
      });
      return;
    }
    const c = trouver(g, cible.id)?.element;
    if (c?.type === "dossier") {
      avecAnnulation(`« ${source.titre} » rangé dans ${c.titre}`, {
        type: A.FUSIONNER,
        sourceId: id,
        cibleId: cible.id,
      });
      return;
    }
    const nouveauDossierId = genererIdParDefaut();
    const fait = avecAnnulation("Dossier créé", {
      type: A.FUSIONNER,
      sourceId: id,
      cibleId: cible.id,
      nouveauDossierId,
      titre: "Dossier",
      creeLe: Date.now(),
    });
    if (fait && OUVRIR_APRES_FUSION) apresFusion?.(nouveauDossierId);
  };

  const glisser = lectureSeule()
    ? null
    : activerGlisser(store, conteneur, {
        parentId,
        rendre,
        intention: intentionAvecSource,
        deposer,
      });
  activerClavierGrille(conteneur);
  if (!lectureSeule()) {
    activerDeplacementClavier(store, conteneur, { annoncer, colonnes: () => colonnes(conteneur) });
  }
  const actions = brancherActionsElements(store, conteneur, { lectureSeule, ouvrirDossier });

  // Ctrl+Shift+↑ in a folder: the element goes up to the parent level, after the folder.
  conteneur.addEventListener("keydown", (e) => {
    if (lectureSeule() || !(e.ctrlKey && e.shiftKey && e.key === "ArrowUp")) return;
    const tuile = e.target.closest(".tuile[data-id]");
    const dossierId = parentId();
    if (!tuile || dossierId == null) return;
    e.preventDefault();
    const d = trouver(grille(), dossierId);
    const versParentId = d.parent?.id ?? null;
    const verdict = peutPlacer(grille(), tuile.dataset.id, versParentId);
    if (!verdict.ok) {
      toast(RAISONS[verdict.raison], { type: "erreur", duree: 4000 });
      return;
    }
    const titre = trouver(grille(), tuile.dataset.id).element.titre;
    avecAnnulation(`« ${titre} » remonté d'un niveau`, {
      type: A.ELEMENT_DEPLACER,
      id: tuile.dataset.id,
      versParentId,
      versIndex: d.index + 1,
    });
    annoncer(`${titre} remonté d'un niveau`);
  });

  conteneur.addEventListener("click", (e) => {
    const dossier = e.target.closest(".tuile--dossier[data-id]");
    if (dossier) {
      e.preventDefault();
      ouvrirDossier?.(dossier.dataset.id, dossier);
      return;
    }
    const plus = e.target.closest("[data-action='ajouter']");
    if (plus && !lectureSeule()) ajouter?.(plus);
  });

  return {
    rendre,
    demanderRendu: () => (glisser ? glisser.demanderRendu() : rendre()),
    elements,
    actions,
    focaliser: (id) =>
      requestAnimationFrame(() =>
        conteneur.querySelector(`.tuile[data-id="${CSS.escape(id)}"]`)?.focus(),
      ),
    detruire: () => glisser?.detruire(),
  };
}
