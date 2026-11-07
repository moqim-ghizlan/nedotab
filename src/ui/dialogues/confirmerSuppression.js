import { demander } from "./commun.js";

/**
 * The ONE confirmation before any removal (sharing space, gallery, todos). Resolves to true only
 * on the "Supprimer" button. The focus starts on "Annuler"; Escape and the backdrop cancel.
 *
 * @param {object} d
 * @param {string} d.message what goes away, precisely ("« Cours algo »", "3 éléments", ...)
 * @param {string} [d.titre]
 * @param {HTMLElement} [d.retourFocus]
 * @returns {Promise<boolean>}
 */
export async function confirmerSuppression({ message, titre = "Supprimer ?", retourFocus } = {}) {
  const ok = await demander({
    titre,
    message: `${message} Cette action est irréversible.`,
    alerte: true,
    retourFocus,
    boutons: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Supprimer", valeur: true, danger: true },
    ],
  });
  return ok === true;
}
