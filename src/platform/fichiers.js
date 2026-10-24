/**
 * Local image storage in IndexedDB (background picture). A tiny key/value wrapper:
 * the project does not take a dependency for it. Works in the extension and the PWA.
 */
const BASE = "nedotab";
const MAGASIN = "fichiers";

let ouverture;
function base() {
  ouverture ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return ouverture;
}

async function transaction(mode, f) {
  const db = await base();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MAGASIN, mode);
    const req = f(tx.objectStore(MAGASIN));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const fichiers = {
  enregistrerFond: (id, blob) => transaction("readwrite", (s) => s.put(blob, `fond:${id}`)),
  lireFond: (id) => transaction("readonly", (s) => s.get(`fond:${id}`)),
  supprimerFond: (id) => transaction("readwrite", (s) => s.delete(`fond:${id}`)),
  /** Local cache of the account's backgrounds (V2.6): downloaded once per device. */
  lireCacheFond: (id) => transaction("readonly", (s) => s.get(`fond-cache:${id}`)),
  ecrireCacheFond: (id, blob) => transaction("readwrite", (s) => s.put(blob, `fond-cache:${id}`)),
  supprimerCacheFond: (id) => transaction("readwrite", (s) => s.delete(`fond-cache:${id}`)),
  async listerCacheFonds() {
    const cles = await transaction("readonly", (s) => s.getAllKeys());
    return cles
      .filter((c) => String(c).startsWith("fond-cache:"))
      .map((c) => String(c).slice("fond-cache:".length));
  },
  /** Keys present (tests, diagnostics). */
  cles: () => transaction("readonly", (s) => s.getAllKeys()),
};
