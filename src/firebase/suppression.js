import { httpsCallable } from "firebase/functions";
import { obtenirFonctions } from "./fonctions.js";

/**
 * V2.10: deletes the signed-in user's account and all their data, on the server. Needs a
 * recent sign-in (error code "functions/failed-precondition" otherwise).
 */
export async function supprimerMonCompte() {
  await httpsCallable(obtenirFonctions(), "supprimerMonCompte")();
}
