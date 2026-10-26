import { el } from "./dom.js";

/**
 * "Modifier la grille" mode (V3.6, finger), as on the iPhone's home screen: the icons wiggle,
 * each shows a "−" to delete it, and an icon is dragged right away (no long press). The state
 * is one class on <html> (`mode-edition`) and an event, so that the grids (glisser.js), the
 * long press (appuiLong.js) and the page swipe (balayage.js) follow without knowing each other.
 */
export const CLASSE_EDITION = "mode-edition";
export const EVENEMENT_EDITION = "modeedition";

export function enEdition() {
  return document.documentElement.classList.contains(CLASSE_EDITION);
}

export function definirEdition(actif) {
  if (enEdition() === actif) return;
  document.documentElement.classList.toggle(CLASSE_EDITION, actif);
  document.dispatchEvent(new CustomEvent(EVENEMENT_EDITION, { detail: { actif } }));
}

/**
 * The "Modifier" / "OK" button of the top bar (visible without hover only, see CSS).
 * Escape leaves the mode.
 * @returns {HTMLButtonElement}
 */
export function creerBoutonEdition() {
  const bouton = el("button", {
    type: "button",
    class: "bouton-modifier",
    "aria-pressed": "false",
    texte: "Modifier",
    onclick: () => definirEdition(!enEdition()),
  });
  document.addEventListener(EVENEMENT_EDITION, ({ detail }) => {
    bouton.textContent = detail.actif ? "OK" : "Modifier";
    bouton.setAttribute("aria-pressed", String(detail.actif));
    bouton.classList.toggle("bouton-modifier--actif", detail.actif);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && enEdition() && !document.querySelector("dialog[open]")) {
      definirEdition(false);
    }
  });
  return bouton;
}
