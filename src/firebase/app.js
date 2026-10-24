import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
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
  // Persistent cache shared by all the open tabs (V2.5): offline writes are kept in
  // IndexedDB and sent when the network is back, even after Chrome was closed. Must be the
  // very first Firestore call. Without IndexedDB (tests in Node) the memory cache is used.
  const firestore = initializeFirestore(
    app,
    typeof indexedDB === "undefined"
      ? {}
      : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  );
  const stockage = getStorage(app);
  if (emulateurs) {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    connectStorageEmulator(stockage, "127.0.0.1", 9199);
  }
  instance = { app, firestore, stockage, emulateurs, projectId: config.projectId };
  return instance;
}
