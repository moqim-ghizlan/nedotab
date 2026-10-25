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

/**
 * Persistent cache shared by all the open tabs (V2.5): offline writes are kept in
 * IndexedDB and sent when the network is back, even after the browser was closed. Must be
 * the very first Firestore call. Without IndexedDB (tests in Node, some private windows)
 * the memory cache is used: the app works, only not offline (V3.3). Firestore itself also
 * falls back to memory when IndexedDB fails later.
 */
function creerFirestore(app) {
  if (typeof indexedDB === "undefined") return initializeFirestore(app, {});
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("NedoTab : cache hors ligne indisponible, cache mémoire utilisé", e);
    return initializeFirestore(app, {});
  }
}

/**
 * Whether this browser keeps data on the device (false in some private windows of Safari).
 * @returns {Promise<boolean>}
 */
export async function cacheHorsLigneDisponible(idb = globalThis.indexedDB) {
  if (!idb) return false;
  try {
    return await new Promise((ok) => {
      const req = idb.open("nedotab-test-cache");
      req.onsuccess = () => {
        req.result.close();
        ok(true);
      };
      req.onerror = () => ok(false);
    });
  } catch {
    return false;
  }
}

/** Initialises Firebase once (modular SDK, bundled locally: no remote code). */
export function obtenirApp() {
  if (instance) return instance;
  const { config, emulateurs } = lireConfig();
  const app = initializeApp(config);
  activerAppCheck(app);
  const firestore = creerFirestore(app);
  const stockage = getStorage(app);
  if (emulateurs) {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    connectStorageEmulator(stockage, "127.0.0.1", 9199);
  }
  instance = { app, firestore, stockage, emulateurs, projectId: config.projectId };
  return instance;
}
