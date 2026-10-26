import { raccourcisParGroupe } from "../core/raccourcis.js";
import { demander } from "./dialogues/commun.js";
import { el } from "./dom.js";

const CHAMPS_SAISIE = "input, textarea, select, [contenteditable]";

/** Window listing the keyboard shortcuts (opened by "?"). */
export function ouvrirAideRaccourcis({ retourFocus } = {}) {
  const contenu = raccourcisParGroupe().map(([groupe, lignes]) =>
    el(
      "section",
      { class: "aide-groupe" },
      el("h3", { class: "aide-groupe-titre", texte: groupe }),
      el(
        "dl",
        { class: "aide-liste" },
        lignes.flatMap(({ touche, action }) => [
          el("dt", {}, el("kbd", { texte: touche })),
          el("dd", { texte: action }),
        ]),
      ),
    ),
  );
  return demander({
    titre: "Raccourcis clavier",
    contenu,
    boutons: [{ libelle: "Fermer", valeur: true, principal: true }],
    retourFocus,
  });
}

/**
 * Shortcuts that belong to the whole page (V3.9): "?" shows the help, Cmd/Ctrl + "," opens
 * the settings. Never while typing in a field, nor over an open window.
 * @returns {() => void} unplugs the listener
 */
export function brancherRaccourcisGlobaux({ ouvrirReglages, ouvrirAide = ouvrirAideRaccourcis }) {
  const surTouche = (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.target.closest?.(CHAMPS_SAISIE) || document.querySelector("dialog[open]:modal")) return;
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      ouvrirAide({ retourFocus: document.activeElement });
    } else if (e.key === "," && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      ouvrirReglages();
    }
  };
  document.addEventListener("keydown", surTouche);
  return () => document.removeEventListener("keydown", surTouche);
}
