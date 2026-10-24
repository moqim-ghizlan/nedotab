import { trouver } from "../core/arbre.js";
import { brancherActionsElements } from "./actionsElement.js";
import { activerDeplacementClavier, activerGlisser } from "./glisser.js";
import { activerClavierGrille, colonnes, rendreGrille } from "./grille.js";

/**
 * One grid level, shared by the home page and the folder window: rendering, drag and drop,
 * keyboard, context menus. `parentId()` gives the folder shown (null = home).
 */
export function creerVueGrille({
  store,
  conteneur,
  parentId = () => null,
  lectureSeule = () => false,
  annoncer = () => {},
  ouvrirDossier,
  ajouter,
  libelleAjout,
}) {
  const elements = () => {
    const id = parentId();
    if (id == null) return store.lire().grille;
    const r = trouver(store.lire().grille, id);
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

  const glisser = lectureSeule() ? null : activerGlisser(store, conteneur, { parentId, rendre });
  activerClavierGrille(conteneur);
  if (!lectureSeule()) {
    activerDeplacementClavier(store, conteneur, { annoncer, colonnes: () => colonnes(conteneur) });
  }
  const actions = brancherActionsElements(store, conteneur, {
    lectureSeule,
    parentId,
    ouvrirDossier,
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
