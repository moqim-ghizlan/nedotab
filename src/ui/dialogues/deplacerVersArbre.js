import { A } from "../../core/actions.js";
import { trouver } from "../../core/arbre.js";
import { creerSelecteurDossier } from "../selecteurDossier.js";
import { demander } from "./commun.js";

/**
 * "Déplacer vers…" with the shared folder tree (T1). The destination is selected in the tree
 * (the path is shown under it), then confirmed with "Déplacer ici" / Enter / double click.
 * Resolves to the chosen parent id (null = home) or undefined when cancelled.
 */
export async function ouvrirDeplacerVers(store, id, { retourFocus } = {}) {
  const grille = store.lire().grille;
  const r = trouver(grille, id);
  if (!r) return undefined;
  let choix;
  const fermer = (valeur) => {
    choix = valeur;
    selecteur.racine.closest("dialog")?.close();
  };
  const selecteur = creerSelecteurDossier({
    grille,
    elementId: id,
    actuel: r.parent?.id ?? null,
    onChoix: (v) => {
      const dialogue = selecteur.racine.closest("dialog");
      const bouton = dialogue?.querySelector('[data-valeur="true"]');
      if (bouton) bouton.disabled = v === undefined;
    },
    onValider: fermer,
    apercu: true,
  });
  const attente = demander({
    titre: `Déplacer « ${r.element.titre} » vers…`,
    contenu: [selecteur.racine],
    boutons: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Déplacer ici", valeur: true, principal: true },
    ],
    retourFocus,
  });
  // The "Déplacer ici" button confirms the current selection.
  const dialogue = selecteur.racine.closest("dialog");
  dialogue.classList.add("dialogue--large");
  const bouton = dialogue.querySelector('[data-valeur="true"]');
  bouton.disabled = true;
  bouton.addEventListener("click", () => {
    choix = selecteur.lire();
  });
  selecteur.focus();
  await attente;
  if (choix === undefined) return undefined;
  store.envoyer({ type: A.ELEMENT_DEPLACER, id, versParentId: choix });
  return choix;
}
