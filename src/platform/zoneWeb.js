/**
 * Storage area of the web app (V3.0), with the same shape as chrome.storage.local so that the
 * extension and the PWA share the same storage code (servicesStockage.js):
 * - `zone.get(cle | cles | null)`, `zone.set(objet)`, `zone.remove(cle | cles)` on IndexedDB
 *   (never localStorage: limited to 5 MB and synchronous);
 * - `evenements.addListener(f)` / `removeListener(f)`: f(changements, "local") after every
 *   write, in this tab and in the other tabs of the same browser (BroadcastChannel), like
 *   chrome.storage.onChanged. Each tab tells its own echoes apart (stockageChrome.js).
 */
const BASE = "nedotab-donnees";
const MAGASIN = "cles";

export function creerZoneWeb({
  nomBase = BASE,
  nomCanal = "nedotab",
  indexedDB = globalThis.indexedDB,
  Canal = globalThis.BroadcastChannel,
} = {}) {
  let ouverture;
  const base = () => {
    ouverture ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(nomBase, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return ouverture;
  };
  /** Runs `f(magasin)` in one transaction; resolves with what `f` returned once committed. */
  const transaction = async (mode, f) => {
    const db = await base();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MAGASIN, mode);
      const resultat = f(tx.objectStore(MAGASIN));
      tx.oncomplete = () => resolve(typeof resultat === "function" ? resultat() : resultat);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };

  const ecouteurs = new Set();
  const canal = Canal ? new Canal(nomCanal) : null;
  const diffuser = (changements, local) => {
    for (const f of ecouteurs) f(changements, "local");
    if (local) canal?.postMessage(changements);
  };
  canal?.addEventListener("message", (e) => diffuser(e.data, false));

  const liste = (cles) => (Array.isArray(cles) ? cles : [cles]);

  const zone = {
    /** null: every key. */
    async get(cles = null) {
      return transaction("readonly", (s) => {
        const resultat = {};
        if (cles == null) {
          const req = s.openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (!c) return;
            resultat[c.key] = c.value;
            c.continue();
          };
        } else {
          for (const cle of liste(cles)) {
            const req = s.get(cle);
            req.onsuccess = () => {
              if (req.result !== undefined) resultat[cle] = req.result;
            };
          }
        }
        return resultat;
      });
    },
    async set(objet) {
      const changements = {};
      await transaction("readwrite", (s) => {
        for (const [cle, valeur] of Object.entries(objet)) {
          s.put(valeur, cle);
          changements[cle] = { newValue: valeur };
        }
      });
      diffuser(changements, true);
    },
    async remove(cles) {
      const changements = {};
      await transaction("readwrite", (s) => {
        for (const cle of liste(cles)) {
          s.delete(cle);
          changements[cle] = { newValue: undefined };
        }
      });
      diffuser(changements, true);
    },
  };

  const evenements = {
    addListener: (f) => ecouteurs.add(f),
    removeListener: (f) => ecouteurs.delete(f),
  };

  return { zone, evenements, fermer: () => canal?.close() };
}
