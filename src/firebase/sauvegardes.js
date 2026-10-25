import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
} from "firebase/firestore";
import { typeAppareil } from "../core/appareil.js";
import { compter } from "../core/fusion.js";
import { aSupprimer, idSauvegarde, nettoyerNom } from "../core/sauvegardes.js";
import { obtenirApp } from "./app.js";

/** Backups of the account: users/{uid}/sauvegardes/{AAAA-MM-JJ_HHmmss_xxxx}, immutable. */
const json = (v) => JSON.parse(JSON.stringify(v));
const col = (uid) => collection(obtenirApp().firestore, "users", uid, "sauvegardes");
export const appareilCourant = () => typeAppareil(import.meta.env.VITE_TARGET);

/** Creates a backup of `etat` (grid + synced settings; picture files are not copied). */
export async function creerSauvegarde(uid, etat, { type, nom = null }) {
  const id = idSauvegarde();
  const { sites, dossiers } = compter(etat.grille);
  await setDoc(doc(col(uid), id), {
    creeLe: serverTimestamp(),
    type,
    nom: type === "manuelle" ? nettoyerNom(nom) : (nettoyerNom(nom) ?? null),
    appareil: appareilCourant(),
    versionSchema: etat.versionSchema,
    nbSites: sites,
    nbDossiers: dossiers,
    grille: json(etat.grille),
    reglages: json(etat.reglages),
  });
  return id;
}

const versListe = (d) => {
  const v = d.data();
  return { id: d.id, ...v, creeLe: v.creeLe?.toMillis?.() ?? null };
};

/** Date (ms) of the last automatic backup, or null. Needs the (type, creeLe) index. */
export async function derniereAuto(uid) {
  const r = await getDocs(
    query(col(uid), where("type", "==", "auto"), orderBy("creeLe", "desc"), limit(1)),
  );
  return r.empty ? null : versListe(r.docs[0]).creeLe;
}

/**
 * One page of the list (newest first), only when the section is open: each backup is a
 * full document (up to 1 MB). `type`: "auto" | "manuelle" | null (all).
 * @returns {Promise<{ sauvegardes: object[], suite: object|null }>}
 */
export async function listerSauvegardes(uid, { type = null, apres = null, taille = 20 } = {}) {
  const contraintes = [
    ...(type ? [where("type", "==", type)] : []),
    orderBy("creeLe", "desc"),
    ...(apres ? [startAfter(apres)] : []),
    limit(taille),
  ];
  const r = await getDocs(query(col(uid), ...contraintes));
  return {
    sauvegardes: r.docs.map(versListe),
    suite: r.docs.length === taille ? r.docs.at(-1) : null,
  };
}

export async function compterManuelles(uid) {
  const r = await getCountFromServer(query(col(uid), where("type", "==", "manuelle")));
  return r.data().count;
}

export function supprimerSauvegarde(uid, id) {
  return deleteDoc(doc(col(uid), id));
}

/** Keeps the `max` most recent backups of `type` (manual ones are never rotated). */
export async function rotation(uid, type, max) {
  if (type === "manuelle") return 0;
  const r = await getDocs(query(col(uid), where("type", "==", type), orderBy("creeLe", "desc")));
  const ids = aSupprimer(r.docs.map(versListe), max, type);
  if (!ids.length) return 0;
  const lot = writeBatch(obtenirApp().firestore);
  for (const id of ids) lot.delete(doc(col(uid), id));
  await lot.commit();
  return ids.length;
}

/** Backup of the account's state before it is replaced (kept: the 10 most recent). */
export async function sauvegarderAvantRemplacement(uid, etat) {
  const id = await creerSauvegarde(uid, etat, {
    type: "avant-restauration",
    nom: "Avant remplacement par un autre appareil",
  });
  await rotation(uid, "avant-restauration", 10);
  return id;
}
