import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { appareilDepuisDoc } from "../core/appareils.js";
import { obtenirApp } from "./app.js";

/**
 * Named devices (T12): users/{uid}/appareils/{idAppareil} = { nom, type, creeLe, vuLe }.
 * Writes are explicit actions (naming, renaming, removing) plus one `vuLe` a day at most.
 * The identity of THIS device (id and name) is kept here so that the writers of the sharing
 * space and of the backups can stamp what they write without knowing the UI.
 */
const col = (uid) => collection(obtenirApp().firestore, "users", uid, "appareils");

let identite = { id: null, nom: null };
/** Called by the app when the device is known (id from storage, name from the list). */
export function definirIdentiteAppareil({ id = null, nom = null } = {}) {
  identite = { id, nom };
}
/** Fields to write on an item or a backup: the id, and the name at that time (frozen). */
export function marqueAppareil(type) {
  return {
    appareil: identite.nom ?? type,
    ...(identite.id ? { appareilId: identite.id } : {}),
  };
}

/** Listens to the list. `rappel(liste, { depuisCache })`; returns the unsubscribe function. */
export function ecouterAppareils(uid, rappel, erreur = () => {}) {
  return onSnapshot(
    col(uid),
    { includeMetadataChanges: true },
    (snap) => {
      const liste = [];
      snap.forEach((d) => {
        const a = appareilDepuisDoc(d.id, d.data());
        if (a) liste.push(a);
      });
      rappel(liste, { depuisCache: snap.metadata.fromCache });
    },
    erreur,
  );
}

/** Creates the entry of this device (id, name, kind). */
export async function enregistrerAppareil(uid, { id, nom, type }) {
  await setDoc(doc(col(uid), id), {
    nom,
    type,
    creeLe: serverTimestamp(),
    vuLe: serverTimestamp(),
  });
}

export async function renommerAppareilDistant(uid, id, nom) {
  await updateDoc(doc(col(uid), id), { nom });
}

/** Only the entry of the list goes away: no data of the account is touched. */
export async function retirerAppareilDistant(uid, id) {
  await deleteDoc(doc(col(uid), id));
}

export async function toucherAppareil(uid, id) {
  await updateDoc(doc(col(uid), id), { vuLe: serverTimestamp() });
}
