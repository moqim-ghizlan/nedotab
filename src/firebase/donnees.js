import {
  clearIndexedDbPersistence,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  terminate,
} from "firebase/firestore";
import { obtenirApp } from "./app.js";

/** Plain JSON copy (Firestore refuses `undefined`). */
const json = (v) => JSON.parse(JSON.stringify(v));

/**
 * Reads users/{uid}. Returns the raw document (to go through migrer() + valider()) and its
 * last change time in ms, or null when the account has no data yet.
 */
export async function lireDocument(uid) {
  const instantane = await getDoc(doc(obtenirApp().firestore, "users", uid));
  if (!instantane.exists()) return null;
  const donnees = instantane.data();
  return { brut: donnees, majLe: donnees.majLe?.toMillis?.() ?? null };
}

/** Fields of users/{uid}, exactly those allowed by the rules (device-only settings never). */
const champs = (etat, idAppareil, revision) => ({
  versionSchema: etat.versionSchema,
  grille: json(etat.grille),
  reglages: json(etat.reglages),
  majLe: serverTimestamp(),
  majPar: idAppareil,
  revision,
});

/**
 * Writes users/{uid} without reading it: only for the first synchronisation (V2.3), when
 * this device's state is chosen. Every later change goes through ecrireParTransaction.
 */
export async function ecrireDocument(uid, etat, idAppareil, revision) {
  await setDoc(doc(obtenirApp().firestore, "users", uid), champs(etat, idAppareil, revision));
}

/**
 * Listens to users/{uid}. `callback(brut, { ecritureEnAttente })`: ecritureEnAttente is true
 * for a snapshot of our own write not yet confirmed by the server (to be ignored).
 */
export function ecouterDocument(uid, callback, surErreur) {
  return onSnapshot(
    doc(obtenirApp().firestore, "users", uid),
    { includeMetadataChanges: true },
    (instantane) =>
      callback(instantane.exists() ? instantane.data() : null, {
        ecritureEnAttente: instantane.metadata.hasPendingWrites,
        depuisCache: instantane.metadata.fromCache,
      }),
    surErreur,
  );
}

/** Network on/off for Firestore (tests and diagnostics). */
export function reseau(actif) {
  const db = obtenirApp().firestore;
  return actif ? enableNetwork(db) : disableNetwork(db);
}

/**
 * Erases Firestore's local cache (sign-out without keeping a copy on this computer). The
 * Firestore instance is stopped: the page must be reloaded before using it again.
 */
export async function effacerCache() {
  const db = obtenirApp().firestore;
  await terminate(db);
  await clearIndexedDbPersistence(db);
}

/**
 * V2.9: reads users/{uid} and writes `calculer(brut).etat` in one transaction (Firestore
 * runs it again if the document changed meanwhile, so `calculer` must be pure). Online only.
 * @param {(brut: object|null) => { etat, ignorees, revision }} calculer
 * @returns {Promise<{ etat, ignorees, revision }>}
 */
export async function ecrireParTransaction(uid, calculer, idAppareil) {
  const db = obtenirApp().firestore;
  const ref = doc(db, "users", uid);
  return runTransaction(db, async (t) => {
    const instantane = await t.get(ref);
    const r = calculer(instantane.exists() ? instantane.data() : null);
    t.set(ref, champs(r.etat, idAppareil, r.revision));
    return r;
  });
}
