import { el } from "./dom.js";

let zone;
let courant = null;

function zoneToasts() {
  zone ??= document.body.appendChild(
    el("div", { class: "toasts", role: "status", "aria-live": "polite" }),
  );
  return zone;
}

/**
 * Shows a single toast at a time (a new one replaces the previous one).
 * `action` is an optional { libelle, onClic } button, e.g. "Annuler".
 */
export function toast(message, { action, duree = 5000, type = "info" } = {}) {
  courant?.fermer(false);
  const boite = el("div", { class: `toast toast--${type}` }, el("span", { texte: message }));
  let minuteur;
  let restant = duree;
  let debut = Date.now();
  const etat = {
    fermer(parAction) {
      clearTimeout(minuteur);
      boite.remove();
      if (courant === etat) courant = null;
      return parAction;
    },
  };
  if (action) {
    boite.append(
      el("button", {
        class: "toast-action",
        type: "button",
        texte: action.libelle,
        onclick: () => {
          etat.fermer(true);
          action.onClic();
        },
      }),
    );
  }
  const lancer = () => {
    debut = Date.now();
    minuteur = setTimeout(() => etat.fermer(false), restant);
  };
  const pause = () => {
    clearTimeout(minuteur);
    restant -= Date.now() - debut;
  };
  boite.addEventListener("mouseenter", pause);
  boite.addEventListener("mouseleave", lancer);
  boite.addEventListener("focusin", pause);
  boite.addEventListener("focusout", lancer);
  zoneToasts().append(boite);
  courant = etat;
  lancer();
  return etat;
}
