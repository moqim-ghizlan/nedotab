import { deleteObject, getBlob, listAll, ref, uploadBytesResumable } from "firebase/storage";
import { obtenirApp } from "./app.js";

/**
 * Background pictures of the account in Storage, under users/{uid}/fonds/ only (rules:
 * 5 MB, raster images). Downloaded once per device: the interface keeps a local cache.
 */
export const cheminFond = (uid, id) => `users/${uid}/fonds/${id}.webp`;

/**
 * Starts the upload. Returns { promesse, annuler } and reports progress (0 to 1).
 * @returns {{ promesse: Promise<void>, annuler: () => void }}
 */
export function envoyerFond(chemin, blob, { surProgression } = {}) {
  const tache = uploadBytesResumable(ref(obtenirApp().stockage, chemin), blob, {
    contentType: blob.type || "image/webp",
    cacheControl: "private, max-age=31536000",
  });
  const promesse = new Promise((resolve, reject) => {
    tache.on(
      "state_changed",
      (s) => surProgression?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      reject,
      () => resolve(),
    );
  });
  return { promesse, annuler: () => tache.cancel() };
}

/** Downloads a picture with the SDK (no download URL used as a background). */
export function telechargerFond(chemin) {
  return getBlob(ref(obtenirApp().stockage, chemin));
}

export function supprimerFondStockage(chemin) {
  return deleteObject(ref(obtenirApp().stockage, chemin));
}

/** Paths of every file in the user's backgrounds folder (orphans check). */
export async function listerFondsStockage(uid) {
  const r = await listAll(ref(obtenirApp().stockage, `users/${uid}/fonds`));
  return r.items.map((i) => i.fullPath);
}
