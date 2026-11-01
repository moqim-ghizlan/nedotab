/**
 * Cache of the AI answers (V4.19), per user, for the tags and the smart search only (the chat
 * is never cached: its conversations are unique). users/{uid}/prive/cacheIa/entrees/{hash}
 * = { reponse, creeLe, expireLe }. Under prive/: the browser can neither read nor write it. The
 * key includes the prompt version, the model and what the answer depends on, so that a changed
 * grid, model or prompt gives a new key. The Firestore TTL policy on `expireLe` cleans up
 * (it can take up to a day): the expiry is checked at reading too.
 */
import { createHash } from "node:crypto";

export const DUREE_TAGS_MS = 30 * 24 * 3600 * 1000;
export const DUREE_RECHERCHE_MS = 24 * 3600 * 1000;

/** Stable key from the parts of a request (strings, numbers, null, arrays). */
export const cleCache = (parties) =>
  createHash("sha256").update(JSON.stringify(parties)).digest("hex");

export function creerCache({ db, horloge = () => Date.now() }) {
  const ref = (uid, cle) => db.doc(`users/${uid}/prive/cacheIa/entrees/${cle}`);
  return {
    /** The cached answer, or null (absent, or expired even if not yet deleted). */
    async lire(uid, cle) {
      try {
        const snap = await ref(uid, cle).get();
        if (!snap.exists) return null;
        const e = snap.data();
        const expire = e.expireLe instanceof Date ? e.expireLe.getTime() : e.expireLe;
        return expire > horloge() ? e.reponse : null;
      } catch {
        return null; // a cache problem never blocks a request
      }
    },
    async ecrire(uid, cle, reponse, dureeMs) {
      try {
        await ref(uid, cle).set({
          reponse,
          creeLe: new Date(horloge()),
          expireLe: new Date(horloge() + dureeMs),
        });
      } catch {
        /* same */
      }
    },
  };
}
