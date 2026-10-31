import { MESSAGE_MAX, compteurVisible } from "../../core/chat.js";
import { el } from "../dom.js";

const LIGNES_MAX = 6;

/** Phone or tablet without a keyboard: Enter makes a new line and the button sends. */
const toucheSeule = () => !!globalThis.matchMedia?.("(pointer: coarse)").matches;

/**
 * Input of the chat (V4.11): a textarea that grows from 1 to 6 lines, Enter sends and
 * Shift+Enter makes a new line (on touch screens Enter makes a new line), a counter from
 * 3 500 characters, a limit of 4 000, and a button that becomes "Arrêter" while waiting.
 */
export function creerSaisie({ surEnvoyer, surArreter }) {
  const zone = el("textarea", {
    class: "chat-zone",
    rows: "1",
    maxlength: String(MESSAGE_MAX),
    placeholder: "Écrivez votre message…",
    "aria-label": "Votre message",
    enterkeyhint: "enter",
    autocomplete: "off",
  });
  const compteur = el("span", { class: "chat-compteur", "aria-hidden": "true", hidden: true });
  const bouton = el("button", { type: "submit", class: "chat-envoyer", texte: "Envoyer" });
  const racine = el(
    "form",
    { class: "chat-saisie", novalidate: true },
    el("div", { class: "chat-zone-boite" }, zone, compteur),
    bouton,
  );
  let attente = false;
  let actif = true;

  function ajuster() {
    zone.style.height = "auto";
    const ligne = parseFloat(globalThis.getComputedStyle?.(zone).lineHeight) || 20;
    const max = ligne * LIGNES_MAX;
    if (zone.scrollHeight) zone.style.height = `${Math.min(zone.scrollHeight, max)}px`;
    const n = [...zone.value].length;
    compteur.hidden = !compteurVisible(n);
    compteur.textContent = `${n}/${MESSAGE_MAX}`;
  }

  function envoyer() {
    const texte = zone.value.trim();
    if (!texte || attente) return;
    zone.value = "";
    ajuster();
    surEnvoyer(texte);
  }

  racine.addEventListener("submit", (e) => {
    e.preventDefault();
    if (attente) surArreter();
    else envoyer();
  });
  zone.addEventListener("input", ajuster);
  zone.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || toucheSeule()) return;
    e.preventDefault();
    envoyer();
  });

  return {
    racine,
    zone,
    focus: () => zone.focus(),
    valeur: () => zone.value,
    /** Puts a text in the field (a question that could not be sent right away). */
    remplir(texte) {
      zone.value = texte;
      ajuster();
      zone.focus();
    },
    /** The input and the send button, or nothing (not ready, offline). */
    activer(oui) {
      actif = oui;
      zone.disabled = !oui;
      if (!attente) bouton.disabled = !oui;
    },
    /** While waiting, the button stops the wait instead of sending. */
    definirAttente(oui) {
      attente = oui;
      bouton.textContent = oui ? "Arrêter" : "Envoyer";
      bouton.classList.toggle("chat-envoyer--arret", oui);
      bouton.disabled = oui ? false : !actif;
    },
  };
}
