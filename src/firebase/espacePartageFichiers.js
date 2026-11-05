import {
  collection,
  doc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getBlob, listAll, ref, uploadBytesResumable } from "firebase/storage";
import {
  QUOTA_MAX,
  cheminStockage,
  creerFile,
  nomAffiche,
  typeDeclare,
} from "../core/espacePartageFichiers.js";
import { lireElement } from "../core/espacePartage.js";
import { DUREE_DEFAUT, calculerExpiration } from "../core/expirationPartage.js";
import { obtenirApp } from "./app.js";
import { marqueAppareil } from "./appareils.js";
import { appareilCourant } from "./sauvegardes.js";

/**
 * Files of the sharing space (V4.25), in Storage under `partages/{uid}/{id}/{safe name}`
 * (a folder at the root, not under users/). NEVER the SDK's download-URL function: a download URL carries a
 * token that makes the file public to whoever holds it. Files are read with getBlob (checked by
 * the rules) and shown through a local blob: URL. One write path, one read path.
 *
 * Order of a send: the file first (progress, cancel), then ONE batch (element + counters
 * nb and octets). If the batch fails the file is deleted at once, so nothing is left behind;
 * a cancelled upload leaves neither file nor document.
 */
const db = () => obtenirApp().firestore;
const elements = (uid) => collection(db(), "users", uid, "espacePartage");
const meta = (uid) => doc(db(), "users", uid, "espacePartageMeta", "usage");

/** At most two transfers at the same time (a 25 MB file is one Blob in memory). */
const file = creerFile();

/**
 * @param {string} uid
 * @param {File} fichier already validated (validerFichier)
 * @param {(part: number) => void} [surProgres] 0 to 1
 * @returns {{ promesse: Promise<string>, annuler: () => void }} promise of the element id
 */
export function envoyerFichier(
  uid,
  fichier,
  surProgres,
  expireLe = calculerExpiration(DUREE_DEFAUT),
  chiffrement = null,
  { titre = "", description = "" } = {},
) {
  const reference = doc(elements(uid)); // automatic id
  // V4.26: an encrypted file keeps a neutral name in Storage; its real name and type live in the
  // encrypted block of the element.
  const chemin = cheminStockage(uid, reference.id, chiffrement ? "fichier.bin" : fichier.name);
  const objet = ref(obtenirApp().stockage, chemin);
  let tache = null;
  let envoye = fichier;
  let annule = false;
  const promesse = file.ajouter(async () => {
    if (annule) throw Object.assign(new Error("annulé"), { code: "annule" });
    if (chiffrement) {
      envoye = new Blob(
        [
          await chiffrement.chiffrerOctets(
            reference.id,
            new Uint8Array(await fichier.arrayBuffer()),
          ),
        ],
        {
          type: "application/octet-stream",
        },
      );
    }
    tache = uploadBytesResumable(objet, envoye, {
      contentType: chiffrement ? "application/octet-stream" : typeDeclare(fichier),
      cacheControl: "private, max-age=0",
    });
    await new Promise((ok, ko) =>
      tache.on(
        "state_changed",
        (s) => surProgres?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        ko,
        ok,
      ),
    ).catch(async (e) => {
      await deleteObject(objet).catch(() => {});
      throw annule ? Object.assign(new Error("annulé"), { code: "annule" }) : e;
    });
    try {
      const lot = writeBatch(db());
      const bloc = chiffrement
        ? {
            contenu: await chiffrement.chiffrerNom(reference.id, {
              contenu: nomAffiche(fichier.name),
              titre: typeDeclare(fichier),
              libelle: titre,
              description,
            }),
            titre: "",
            chiffre: true,
          }
        : {
            contenu: nomAffiche(fichier.name),
            // The title written by the user, or the name of the file.
            titre: titre || nomAffiche(fichier.name),
            ...(description ? { description } : {}),
          };
      lot.set(reference, {
        type: "fichier",
        ...bloc,
        ...marqueAppareil(appareilCourant()),
        epingle: false,
        creeLe: serverTimestamp(),
        expireLe: Timestamp.fromMillis(expireLe),
        taille: envoye.size,
        typeMime: chiffrement ? "application/octet-stream" : typeDeclare(fichier),
        chemin,
      });
      lot.set(meta(uid), { nb: increment(1), octets: increment(envoye.size) }, { merge: true });
      await lot.commit();
    } catch (e) {
      // The element was refused (full space, rules): the file must not stay.
      await deleteObject(objet).catch(() => {});
      throw e;
    }
    return reference.id;
  });
  return {
    promesse,
    annuler: () => {
      annule = true;
      tache?.cancel();
    },
  };
}

/** The content of a file as a Blob (kept in memory by the caller for the session only). */
export function lireFichier(chemin) {
  return getBlob(ref(obtenirApp().stockage, chemin));
}

/** Removes the element and both counters in ONE batch, then the file (best effort). */
export async function supprimerFichier(uid, element) {
  const lot = writeBatch(db());
  lot.delete(doc(elements(uid), element.id));
  lot.set(
    meta(uid),
    { nb: increment(-1), octets: increment(-(element.taille ?? 0)) },
    { merge: true },
  );
  await lot.commit();
  if (element.chemin)
    await deleteObject(ref(obtenirApp().stockage, element.chemin)).catch(() => {});
}

// No "Annuler" for a deleted file: the file itself is gone from Storage.

/**
 * Reconciliation: recounts the elements and their sizes, corrects the counters, and removes
 * the files of `partages/{uid}/` that no element points to (leftovers of a crash).
 * @returns {Promise<{ nb: number, octets: number, orphelins: number }>}
 */
export async function reconcilier(uid) {
  const s = await getDocs(elements(uid));
  const els = s.docs.map((d) => lireElement(d.id, d.data())).filter(Boolean);
  const octets = els.reduce((n, e) => n + (e.type === "fichier" ? e.taille : 0), 0);
  const connus = new Set(els.filter((e) => e.type === "fichier").map((e) => e.chemin));
  let orphelins = 0;
  const racine = await listAll(ref(obtenirApp().stockage, `partages/${uid}`)).catch(() => null);
  for (const dossier of racine?.prefixes ?? []) {
    const contenu = await listAll(dossier).catch(() => ({ items: [] }));
    for (const item of contenu.items) {
      if (connus.has(item.fullPath)) continue;
      await deleteObject(item).catch(() => {});
      orphelins++;
    }
  }
  await setDoc(meta(uid), { nb: Math.min(els.length, 200), octets: Math.min(octets, QUOTA_MAX) });
  return { nb: els.length, octets, orphelins };
}
