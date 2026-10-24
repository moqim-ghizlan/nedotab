import { el } from "../dom.js";
import { rapatrierToasts } from "../toast.js";

let compteur = 0;

/**
 * Small modal dialog resolving to the value of the chosen button (null on Escape/Cancel).
 * Buttons: { libelle, valeur, principal?, danger? }. The last button is the default one.
 */
export function demander({ titre, message, boutons, contenu = [], retourFocus }) {
  return new Promise((resolve) => {
    const id = `dialogue-${++compteur}`;
    let valeur = null;
    const dialogue = el(
      "dialog",
      { class: "dialogue", "aria-labelledby": id },
      el(
        "form",
        { method: "dialog", novalidate: true, class: "formulaire" },
        el("h2", { id, class: "dialogue-titre", texte: titre }),
        message ? el("p", { class: "dialogue-message", texte: message }) : null,
        ...contenu,
        el(
          "div",
          { class: "dialogue-actions dialogue-actions--empile" },
          boutons.map((b) =>
            el("button", {
              type: b.principal ? "submit" : "button",
              class: `bouton${b.principal ? " bouton--principal" : ""}${b.danger ? " bouton--danger" : ""}`,
              texte: b.libelle,
              dataset: { valeur: String(b.valeur) },
              onclick: b.principal
                ? null
                : () => {
                    valeur = b.valeur;
                    dialogue.close();
                  },
            }),
          ),
        ),
      ),
    );
    const principal = boutons.find((b) => b.principal);
    dialogue.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      valeur = principal?.valeur ?? null;
      dialogue.close();
    });
    dialogue.addEventListener("close", () => {
      rapatrierToasts();
      dialogue.remove();
      retourFocus?.focus();
      resolve(valeur);
    });
    // Nested in an open dialog so it stays above it and interactive.
    (document.querySelector("dialog[open]") ?? document.body).append(dialogue);
    dialogue.showModal();
    (dialogue.querySelector("input") ?? dialogue.querySelector(".bouton--principal"))?.focus();
  });
}

/** Asks for a folder name. Resolves to the name, or null when cancelled. */
export async function demanderNomDossier({
  titre = "Nouveau dossier",
  valeur = "",
  libelleValider = "Créer",
  retourFocus,
} = {}) {
  const champ = el("input", {
    id: "nom-dossier",
    type: "text",
    maxlength: "40",
    autocomplete: "off",
    value: valeur,
    placeholder: "Dossier",
  });
  const ok = await demander({
    titre,
    contenu: [
      el("div", { class: "champ" }, el("label", { for: "nom-dossier", texte: "Nom" }), champ),
    ],
    boutons: [
      { libelle: "Annuler", valeur: false },
      { libelle: libelleValider, valeur: true, principal: true },
    ],
    retourFocus,
  });
  return ok ? champ.value : null;
}
