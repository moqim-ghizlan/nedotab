import { el } from "./dom.js";

let zone;
/** One toast per key: a new toast replaces the previous one with the same key. */
const courants = new Map();

function zoneToasts() {
  zone ??= document.body.appendChild(
    el("div", { class: "toasts", role: "status", "aria-live": "polite" }),
  );
  if (!zone.isConnected) document.body.append(zone);
  return zone;
}

/** Call before removing a dialog that may hold the toasts, so they stay visible. */
export function rapatrierToasts() {
  if (zone && zone.parentElement !== document.body) document.body.append(zone);
}

/**
 * Shows a toast. `action` is an optional { libelle, onClic } button, e.g. "Annuler".
 * Toasts sharing the same `cle` replace each other (default key: "principal").
 */
export function toast(message, { action, duree = 5000, type = "info", cle = "principal" } = {}) {
  courants.get(cle)?.fermer(false);
  const boite = el("div", { class: `toast toast--${type}` }, el("span", { texte: message }));
  let minuteur;
  let restant = duree;
  let debut = Date.now();
  const etat = {
    fermer(parAction) {
      clearTimeout(minuteur);
      boite.remove();
      if (courants.get(cle) === etat) courants.delete(cle);
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
  // Inside an open modal <dialog>, the rest of the page is inert: show toasts in it.
  const dialogue = document.querySelector("dialog[open]");
  const conteneur = zoneToasts();
  if (dialogue && conteneur.parentElement !== dialogue) dialogue.append(conteneur);
  if (!dialogue && conteneur.parentElement !== document.body) document.body.append(conteneur);
  conteneur.append(boite);
  courants.set(cle, etat);
  lancer();
  return etat;
}
