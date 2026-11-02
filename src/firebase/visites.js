import {
  Timestamp,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  FieldPath,
} from "firebase/firestore";
import { obtenirApp } from "./app.js";

const ref = (uid) => doc(obtenirApp().firestore, "users", uid, "stats", "visites");

/**
 * V4.21: adds a batch of visits to users/{uid}/stats/visites in ONE write. Every weight and
 * count is an atomic increment (two devices never overwrite each other); the document is
 * created by the first write (merge). `stats` = { poids, compte, derniere (ms) } to add.
 */
export async function envoyerVisites(uid, stats) {
  const ids = Object.keys(stats.poids);
  if (ids.length === 0) return;
  const poids = {};
  const compte = {};
  const derniere = {};
  for (const id of ids) {
    poids[id] = increment(stats.poids[id]);
    compte[id] = increment(stats.compte[id] ?? 1);
    if (stats.derniere[id]) derniere[id] = Timestamp.fromMillis(stats.derniere[id]);
  }
  await setDoc(ref(uid), { poids, compte, derniere, majLe: serverTimestamp() }, { merge: true });
}

/** Raw document (or null). */
export async function lireVisites(uid) {
  const s = await getDoc(ref(uid));
  return s.exists() ? s.data() : null;
}

/** Listens to the statistics; `rappel(brut|null)`. */
export function ecouterVisites(uid, rappel, surErreur) {
  return onSnapshot(ref(uid), (s) => rappel(s.exists() ? s.data() : null), surErreur);
}

/**
 * Last server change time of the document, in ms (0 if none), once the writes this device
 * had queued are acknowledged. Used to know whether a batch marked "sent" went through.
 */
export async function majServeur(uid) {
  await waitForPendingWrites(obtenirApp().firestore);
  const s = await getDocFromServer(ref(uid));
  return s.exists() ? (s.data().majLe?.toMillis?.() ?? 0) : 0;
}

/** Removes the entries of sites that no longer exist (one write). */
export async function retirerEntrees(uid, ids) {
  if (ids.length === 0) return;
  const champs = [];
  for (const id of ids) {
    for (const groupe of ["poids", "compte", "derniere"]) {
      champs.push(new FieldPath(groupe, id), deleteField());
    }
  }
  champs.push("majLe", serverTimestamp());
  await updateDoc(ref(uid), ...champs);
}

/** "Effacer l'historique d'utilisation". */
export async function effacerVisites(uid) {
  await deleteDoc(ref(uid));
}

/** Adds statistics (local ones of a user who was not signed in) to the document. */
export const ajouterStats = envoyerVisites;
