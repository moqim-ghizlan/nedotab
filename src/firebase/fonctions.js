import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { obtenirApp } from "./app.js";

let fonctions = null;

/**
 * Functions of the project, region europe-west1 (the same as the server: another region
 * answers "not-found"), on the emulator in tests.
 */
export function obtenirFonctions() {
  if (fonctions) return fonctions;
  const { app, emulateurs } = obtenirApp();
  fonctions = getFunctions(app, "europe-west1");
  if (emulateurs) connectFunctionsEmulator(fonctions, "127.0.0.1", 5001);
  return fonctions;
}
