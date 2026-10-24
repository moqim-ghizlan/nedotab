import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { obtenirApp } from "./app.js";

let fonctions = null;

/** Functions of the project (region europe-west1), on the emulator in tests. */
function obtenirFonctions() {
  if (fonctions) return fonctions;
  const { app, emulateurs } = obtenirApp();
  fonctions = getFunctions(app, "europe-west1");
  if (emulateurs) connectFunctionsEmulator(fonctions, "127.0.0.1", 5001);
  return fonctions;
}

/**
 * V2.10: deletes the signed-in user's account and all their data, on the server. Needs a
 * recent sign-in (error code "functions/failed-precondition" otherwise).
 */
export async function supprimerMonCompte() {
  await httpsCallable(obtenirFonctions(), "supprimerMonCompte")();
}
