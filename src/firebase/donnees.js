import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { compter } from "../core/fusion.js";
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

/**
 * Writes users/{uid} with exactly the fields allowed by the rules: the device-only
 * settings (local picture background) are never sent.
 */
export async function ecrireDocument(uid, etat, idAppareil, revision) {
  await setDoc(doc(obtenirApp().firestore, "users", uid), {
    versionSchema: etat.versionSchema,
    grille: json(etat.grille),
    reglages: json(etat.reglages),
    majLe: serverTimestamp(),
    majPar: idAppareil,
    revision,
  });
}

/** Backup of the account's data before it is replaced (type "avant-restauration"). */
export async function sauvegarderAvantRemplacement(uid, etat, appareil) {
  const { sites, dossiers } = compter(etat.grille);
  await addDoc(collection(obtenirApp().firestore, "users", uid, "sauvegardes"), {
    creeLe: serverTimestamp(),
    type: "avant-restauration",
    nom: "Avant remplacement par un autre appareil",
    appareil,
    versionSchema: etat.versionSchema,
    nbSites: sites,
    nbDossiers: dossiers,
    grille: json(etat.grille),
    reglages: json(etat.reglages),
  });
}
