import { httpsCallable } from "firebase/functions";
import { obtenirFonctions } from "./fonctions.js";

/** The AI functions the browser may call (V4.0). Keys never come back from them. */
export const FONCTIONS_IA = ["iaEnregistrerCle", "iaSupprimerCle", "iaEtatCles", "iaTester"];

/**
 * Calls an AI function of the server and returns its answer. Errors keep their callable
 * code and `details.code` (see src/ui/messagesIa.js for the text shown).
 */
export async function appelerIa(nom, donnees = {}) {
  if (!FONCTIONS_IA.includes(nom)) throw new Error(`Fonction IA inconnue : ${nom}`);
  const r = await httpsCallable(obtenirFonctions(), nom)(donnees);
  return r.data;
}
