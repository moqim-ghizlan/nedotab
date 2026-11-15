import { deleteObject, getBlob, listAll, ref, uploadBytesResumable } from "firebase/storage";
import {
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { creerFile } from "../core/espacePartageFichiers.js";
import {
  cheminImage,
  cheminMini,
  cheminsDeFichiers,
  creerMetaImage,
  nettoyerNote,
  nouvelIdImage,
  octetsDesImages,
  ordreSuivant,
} from "../core/imagesTodo.js";
import { PISTES_MAX } from "../core/pistes.js";
import { obtenirApp } from "./app.js";

/**
 * Images of the todos (V6.4), in Storage under `todos/{uid}/{todoId}/{id}.{ext}` (a folder at
 * the ROOT, not under users/, so that a lifecycle rule can target "todos/" alone). NEVER the SDK's
 * download-URL function: its address carries a token that makes the file public to whoever holds
 * it. Files are read with getBlob (checked by the rules) and shown through a local blob: URL.
 * One write path, one read path.
 *
 * Order of an add: the picture and its thumbnail first (progress, cancel), then ONE transaction
 * that re-reads the todo (two devices may add an image at the same time: neither is lost), adds
 * the metadata to `images` and the size to the counter `octets`. If it fails, the files are
 * deleted at once. Order of a removal: the files first, then the document (can be run again).
 */
const db = () => obtenirApp().firestore;
const stockage = () => obtenirApp().stockage;
const todoRef = (uid, id) => doc(db(), "users", uid, "todos", id);
const metaRef = (uid) => doc(db(), "users", uid, "todosMeta", "usage");

/** At most two transfers at the same time (a picture is one Blob in memory). */
const file = creerFile();

/**
 * @param {string} uid
 * @param {string} todoId a todo that already exists
 * @param {{ blob: Blob, mini: Blob, ext: string, typeMime: string, largeur: number, hauteur: number }} image
 *        already compressed (compresserImage.js)
 * @param {{ note?: string, pisteId?: string, surProgres?: (part: number) => void }} [options]
 *        `pisteId`: the piste that gets the picture (7.3), in the same transaction
 * @returns {{ promesse: Promise<object>, annuler: () => void }} promise of the stored metadata
 */
export function envoyerImage(uid, todoId, image, { note = "", pisteId = null, surProgres } = {}) {
  const id = nouvelIdImage();
  const chemin = cheminImage(uid, todoId, id, image.ext);
  const objet = ref(stockage(), chemin);
  const objetMini = ref(stockage(), cheminMini(chemin));
  let tache = null;
  let annule = false;
  const nettoyer = () => Promise.all([deleteObject(objet), deleteObject(objetMini)].map((p) => p.catch(() => {})));
  const televerser = (cible, blob, part) =>
    new Promise((ok, ko) => {
      tache = uploadBytesResumable(cible, blob, {
        contentType: image.typeMime,
        cacheControl: "private, max-age=0",
      });
      tache.on("state_changed", (s) => surProgres?.(part(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0)), ko, ok);
    });

  const promesse = file.ajouter(async () => {
    if (annule) throw Object.assign(new Error("annulé"), { code: "annule" });
    try {
      await televerser(objet, image.blob, (p) => p * 0.9);
      await televerser(objetMini, image.mini, (p) => 0.9 + p * 0.1);
    } catch (e) {
      await nettoyer();
      throw annule ? Object.assign(new Error("annulé"), { code: "annule" }) : e;
    }
    try {
      return await runTransaction(db(), async (tx) => {
        const s = await tx.get(todoRef(uid, todoId));
        if (!s.exists()) throw Object.assign(new Error("todo introuvable"), { code: "not-found" });
        const actuelles = s.data().images ?? [];
        if (actuelles.length >= PISTES_MAX) throw Object.assign(new Error("limite"), { code: "limite" });
        const pistes = s.data().pistes;
        const piste = pisteId ? (pistes ?? []).find((p) => p.id === pisteId) : null;
        // One picture per piste, and the piste must still exist (deleted from another device).
        if (pisteId && (!piste || piste.imageId)) throw Object.assign(new Error("limite"), { code: "limite" });
        const meta = creerMetaImage({
          id,
          chemin,
          taille: image.blob.size,
          typeMime: image.typeMime,
          largeur: image.largeur,
          hauteur: image.hauteur,
          note,
          ordre: ordreSuivant(actuelles),
        });
        tx.update(todoRef(uid, todoId), {
          images: [...actuelles, meta],
          ...(piste ? { pistes: pistes.map((p) => (p.id === pisteId ? { ...p, imageId: id } : p)) } : {}),
          modifieLe: serverTimestamp(),
        });
        tx.set(metaRef(uid), { octets: increment(meta.taille) }, { merge: true });
        return meta;
      });
    } catch (e) {
      // The todo refused it (full, deleted elsewhere, rules): the files must not stay.
      await nettoyer();
      throw e;
    }
  });
  return {
    promesse,
    annuler: () => {
      annule = true;
      tache?.cancel();
    },
  };
}

/** The picture (or its thumbnail) as a Blob, read with the rules of Storage. */
export const lireImage = (chemin) => getBlob(ref(stockage(), chemin));

/** Changes the images of a todo from a function of the CURRENT list (read in a transaction). */
async function modifierListe(uid, todoId, fabrique, octetsEnPlus = () => 0) {
  return runTransaction(db(), async (tx) => {
    const s = await tx.get(todoRef(uid, todoId));
    if (!s.exists()) throw Object.assign(new Error("todo introuvable"), { code: "not-found" });
    const avant = s.data().images ?? [];
    const apres = fabrique(avant);
    // A piste never points to a picture that is gone.
    const pistes = s.data().pistes;
    const gardees = new Set(apres.map((i) => i.id));
    const nettoyees = Array.isArray(pistes)
      ? pistes.map((p) => (p.imageId && !gardees.has(p.imageId) ? { ...p, imageId: null } : p))
      : null;
    tx.update(todoRef(uid, todoId), {
      images: apres,
      ...(nettoyees && nettoyees.some((p, i) => p !== pistes[i]) ? { pistes: nettoyees } : {}),
      modifieLe: serverTimestamp(),
    });
    const delta = octetsEnPlus(avant, apres);
    if (delta !== 0) tx.set(metaRef(uid), { octets: increment(delta) }, { merge: true });
    return apres;
  });
}

/** Note of one picture (plain text, 300 characters). */
export function majNote(uid, todoId, imageId, note) {
  const propre = nettoyerNote(note);
  return modifierListe(uid, todoId, (liste) => liste.map((i) => (i.id === imageId ? { ...i, note: propre } : i)));
}

/** New order of the pictures: `ids` in the wanted order. */
export function reordonnerImages(uid, todoId, ids) {
  return modifierListe(uid, todoId, (liste) =>
    liste.map((i) => ({ ...i, ordre: (Math.max(0, ids.indexOf(i.id)) + 1) * 1000 })),
  );
}

/** Deletes the files first (picture + thumbnail), then removes the picture from the todo. */
export async function supprimerImage(uid, todoId, image) {
  await supprimerFichiers([image]);
  return modifierListe(
    uid,
    todoId,
    (liste) => liste.filter((i) => i.id !== image.id),
    (avant, apres) => -(octetsDesImages(avant) - octetsDesImages(apres)),
  );
}

/** Deletes the files of a list of images (a file already gone is not an error). */
export async function supprimerFichiers(images) {
  for (const chemin of cheminsDeFichiers(images)) {
    try {
      await deleteObject(ref(stockage(), chemin));
    } catch (e) {
      if (e?.code !== "storage/object-not-found") throw e;
    }
  }
}

/** The whole folder of a todo, including files no document points to (used when it is deleted). */
export async function supprimerDossierTodo(uid, todoId) {
  const contenu = await listAll(ref(stockage(), `todos/${uid}/${todoId}`)).catch(() => ({ items: [] }));
  for (const item of contenu.items) await deleteObject(item).catch(() => {});
}
