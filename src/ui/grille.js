import { el } from "./dom.js";
import { creerTuile } from "./tuile.js";
import { creerTuileDossier } from "./tuileDossier.js";

/**
 * Rebuilds a grid level in a fragment and swaps it in one go. Sites and folders share the
 * same cell; the "+" tile is not part of the state: the renderer adds it at the end.
 */
export function rendreGrille(
  conteneur,
  elements,
  { avecAjout = false, libelleAjout = "Ajouter un site" } = {},
) {
  const fragment = document.createDocumentFragment();
  for (const element of elements) {
    const tuile =
      element.type === "dossier"
        ? creerTuileDossier(element)
        : element.type === "site"
          ? creerTuile(element)
          : null;
    if (!tuile) continue;
    fragment.append(
      el(
        "li",
        { class: "case case--element" },
        tuile,
        el("button", {
          type: "button",
          class: "tuile-plus",
          "aria-label": `Actions pour ${element.titre}`,
          dataset: { menu: element.id },
          texte: "⋯",
        }),
      ),
    );
  }
  if (avecAjout) {
    fragment.append(
      el(
        "li",
        { class: "case case--ajout" },
        el(
          "button",
          {
            type: "button",
            class: "tuile tuile--ajout",
            "aria-label": libelleAjout,
            dataset: { action: "ajouter" },
          },
          el("span", {
            class: "tuile-icone tuile-icone--ajout",
            "aria-hidden": "true",
            texte: "+",
          }),
          el("span", { class: "tuile-titre", texte: "Ajouter" }),
        ),
      ),
    );
  }
  conteneur.replaceChildren(fragment);
}

export function colonnes(conteneur) {
  const modele = getComputedStyle(conteneur).gridTemplateColumns;
  return Math.max(1, modele && modele !== "none" ? modele.split(" ").length : 1);
}

const DEPLACEMENTS = { ArrowLeft: -1, ArrowRight: 1 };

/** Arrow keys move the focus inside the grid (ignored while typing in a field). */
export function activerClavierGrille(conteneur) {
  conteneur.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    const tuiles = [...conteneur.querySelectorAll(".tuile")];
    const actuel = tuiles.indexOf(document.activeElement);
    if (actuel < 0) return;
    const pas = DEPLACEMENTS[e.key] ?? (e.key === "ArrowUp" ? -1 : 1) * colonnes(conteneur);
    const cible = tuiles[actuel + pas];
    if (cible) {
      e.preventDefault();
      cible.focus();
    }
  });
}
