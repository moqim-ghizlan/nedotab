import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { activerAppCheck } from "./appCheck.js";
import { lireConfig } from "./config.js";

let instance = null;

/** Initialises Firebase once (modular SDK, bundled locally: no remote code). */
export function obtenirApp() {
  if (instance) return instance;
  const { config, emulateurs } = lireConfig();
  const app = initializeApp(config);
  activerAppCheck(app);
  const firestore = getFirestore(app);
  const stockage = getStorage(app);
  if (emulateurs) {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    connectStorageEmulator(stockage, "127.0.0.1", 9199);
  }
  instance = { app, firestore, stockage, emulateurs, projectId: config.projectId };
  return instance;
}
