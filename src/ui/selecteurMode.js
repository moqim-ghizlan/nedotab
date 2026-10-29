import { el } from "./dom.js";

const LIBELLES = {
  rechercher: "Rechercher dans vos sites",
  demander: "Poser une question à l'assistant",
};

/**
 * Two radio buttons (magnifier / spark) at the left of the search field (V4.8).
 * `surChoix(mode)` is called on a click or a touch.
 */
export function creerSelecteurMode({ surChoix }) {
  const bouton = (mode, symbole) =>
    el(
      "button",
      {
        type: "button",
        class: `mode-bouton mode-bouton--${mode}`,
        role: "radio",
        "aria-checked": "false",
        "aria-label": LIBELLES[mode],
        title: LIBELLES[mode],
        dataset: { mode },
        onmousedown: (e) => e.preventDefault(), // the focus stays in the field
        onclick: () => surChoix(mode),
      },
      el("span", { class: "mode-symbole", "aria-hidden": "true", texte: symbole }),
    );
  const boutons = { rechercher: bouton("rechercher", ""), demander: bouton("demander", "✦") };
  boutons.rechercher.firstChild.classList.add("mode-symbole--loupe");
  const racine = el(
    "div",
    { class: "mode-selecteur", role: "radiogroup", "aria-label": "Mode de la barre", hidden: true },
    boutons.rechercher,
    boutons.demander,
  );
  return {
    racine,
    definir(mode) {
      for (const [m, b] of Object.entries(boutons)) {
        b.setAttribute("aria-checked", String(m === mode));
        b.tabIndex = m === mode ? 0 : -1;
      }
    },
    afficher(oui) {
      racine.hidden = !oui;
    },
  };
}
