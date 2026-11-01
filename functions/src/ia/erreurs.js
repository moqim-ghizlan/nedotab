/**
 * Errors of the AI functions as callable errors (V4.0): a callable code the browser
 * understands, a short French message, and `details.code` for the precise reason (the
 * browser shows its own text for it, src/ui/messagesIa.js). Nothing secret goes out.
 */
import { QuotaDepasse } from "../quota.js";
import { EntreeInvalide } from "../validation.js";
import { ErreurFournisseur } from "./fournisseurs/commun.js";

const PAR_CODE = {
  "cle-invalide": ["failed-precondition", "Clé refusée par le fournisseur."],
  "cle-sans-credit": ["failed-precondition", "Clé sans crédit chez le fournisseur."],
  "cle-absente": ["failed-precondition", "Aucune clé enregistrée pour ce fournisseur."],
  "limite-fournisseur": ["resource-exhausted", "Trop de demandes chez le fournisseur."],
  "requete-invalide": ["invalid-argument", "Demande refusée par le fournisseur."],
  "modele-introuvable": ["not-found", "Ce modèle n'est pas disponible avec cette clé."],
  "pas-de-modele": ["failed-precondition", "Aucun modèle choisi pour cet usage."],
  "ia-desactivee": ["failed-precondition", "L'assistant IA est désactivé."],
  "reponse-invalide": ["internal", "Réponse de l'IA inutilisable."],
  "fournisseur-indisponible": ["unavailable", "Fournisseur indisponible pour l'instant."],
  "limite-personnelle": ["resource-exhausted", "Votre limite personnelle est atteinte."],
  "conversation-introuvable": ["not-found", "Conversation introuvable."],
  "conversation-pleine": ["failed-precondition", "Cette conversation est pleine (200 messages)."],
  "conversation-sans-question": ["failed-precondition", "Aucune question à laquelle répondre."],
};

/** @returns {{ code: string, message: string, details: { code: string } }} */
export function versErreurAppel(e) {
  if (e instanceof EntreeInvalide)
    return { code: "invalid-argument", message: e.message, details: { code: "entree-invalide" } };
  if (e instanceof QuotaDepasse)
    return { code: "resource-exhausted", message: e.message, details: { code: e.pages ? "quota-pages-depasse" : "quota-depasse" } };
  if (e instanceof ErreurFournisseur && PAR_CODE[e.code]) {
    const [code, message] = PAR_CODE[e.code];
    return { code, message, details: { code: e.code } };
  }
  return { code: "internal", message: "Erreur interne.", details: { code: "interne" } };
}
