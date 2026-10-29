/**
 * Two modes for the search bar (V4.8): "rechercher" (instant local search) and "demander" (a
 * question for the AI). Pure rules for the switching and for what the AI state allows.
 */
export const MODES = ["rechercher", "demander"];
export const QUESTION_MAX = 500;
export const QUESTION_COMPTEUR = 400;

export const autreMode = (mode) => (mode === "demander" ? "rechercher" : "demander");

/**
 * A "?" typed as the very first character (field empty before, "?" alone after) switches to
 * the question mode and is removed. A "?" pasted or typed later in a text does nothing.
 * @returns {{ mode: string, valeur: string }}
 */
export function apresSaisie({ mode, avant, apres, actif }) {
  if (actif && mode === "rechercher" && avant === "" && apres === "?")
    return { mode: "demander", valeur: "" };
  return { mode, valeur: apres };
}

/**
 * Keys that change the mode. `Tab` only on an empty field (else it keeps moving the focus),
 * Ctrl/Cmd+J at any time, Backspace on an empty field leaves the question mode.
 * @returns {string|null} the new mode, or null when the key does nothing here
 */
export function modeApresTouche({ mode, touche, valeurVide, ctrl = false, maj = false, actif }) {
  if (!actif) return null;
  if (touche.toLowerCase() === "j" && ctrl) return autreMode(mode);
  if (touche === "Tab" && !maj && !ctrl && valeurVide) return autreMode(mode);
  if (touche === "Backspace" && valeurVide && mode === "demander") return "rechercher";
  return null;
}

/**
 * What the AI state (`iaPrete`) allows in the bar.
 * - `afficher`: is the mode selector shown at all;
 * - `envoi`: can a question be sent;
 * - `message` / `action`: what to say in the question mode when it cannot.
 */
export function etatModes(pret) {
  if (pret?.prete) return { afficher: true, envoi: true, message: null, action: null };
  switch (pret?.raison) {
    case "pas-de-cle":
    case "pas-de-modele":
      return {
        afficher: true,
        envoi: false,
        message: "Configurez l'assistant IA",
        action: "reglages",
      };
    case "hors-ligne":
      return {
        afficher: true,
        envoi: false,
        message: "Connexion Internet nécessaire",
        action: null,
      };
    default: // "desactivee", "mode-local", unknown: no trace of the question mode
      return { afficher: false, envoi: false, message: null, action: null };
  }
}

/** Counter shown from 400 characters of a question. */
export const compteurVisible = (longueur) => longueur >= QUESTION_COMPTEUR;
