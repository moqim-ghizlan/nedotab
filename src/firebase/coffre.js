import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { obtenirApp } from "./app.js";

/**
 * Vault (V4.26): users/{uid}/vaultMeta/cle holds ONLY salts, iteration count and the wrapped
 * keys (already encrypted on the device). No password, no key, no hint ever passes through
 * this module: it receives the `meta` object built by src/core/coffre.js.
 */
const db = () => obtenirApp().firestore;
const refMeta = (uid) => doc(db(), "users", uid, "vaultMeta", "cle");

const CHAMPS = ["version", "sel1", "sel2", "iterations", "enveloppeMdp", "enveloppeSecours"];
const pick = (meta, champs) => Object.fromEntries(champs.map((c) => [c, meta[c]]));

/** @returns {Promise<object|null>} the vault description, or null when there is none */
export async function lireMeta(uid) {
  const { getDoc } = await import("firebase/firestore");
  const s = await getDoc(refMeta(uid));
  if (!s.exists()) return null;
  const d = s.data();
  return CHAMPS.every((c) => d[c] != null)
    ? { ...pick(d, CHAMPS), creeLe: d.creeLe?.toMillis?.() ?? null }
    : null;
}

/**
 * Creates the vault only if none exists (transaction + rule "create"). Two devices creating at
 * the same time: the loser gets `{ existe: true }` and must unlock the existing vault instead.
 * @returns {Promise<{ cree: true } | { existe: true }>}
 */
export async function creerMeta(uid, meta) {
  return runTransaction(db(), async (t) => {
    if ((await t.get(refMeta(uid))).exists()) return { existe: true };
    t.set(refMeta(uid), { ...pick(meta, CHAMPS), creeLe: serverTimestamp() });
    return { cree: true };
  }).catch((e) => {
    // The rule refused the create because another device won the race.
    if (e?.code === "permission-denied") return { existe: true };
    throw e;
  });
}

/** New password or new secret key: only the wrapping fields change (the rules enforce it). */
export async function majEnveloppes(uid, meta) {
  await updateDoc(refMeta(uid), {
    sel1: meta.sel1,
    sel2: meta.sel2,
    enveloppeMdp: meta.enveloppeMdp,
    enveloppeSecours: meta.enveloppeSecours,
    majLe: serverTimestamp(),
  });
}

/**
 * Destroys the vault AND every encrypted item (and file): without the key they are unreadable
 * anyway. The counters follow in the same batches.
 * @returns {Promise<number>} number of items removed
 */
export async function detruireCoffre(uid) {
  const col = collection(db(), "users", uid, "espacePartage");
  const compteur = doc(db(), "users", uid, "espacePartageMeta", "usage");
  let total = 0;
  for (;;) {
    const s = await getDocs(query(col, where("chiffre", "==", true)));
    if (s.empty) break;
    for (const d of s.docs) {
      const e = d.data();
      if (e.type === "fichier" && typeof e.chemin === "string")
        await deleteObject(ref(obtenirApp().stockage, e.chemin)).catch(() => {});
      const lot = writeBatch(db());
      lot.delete(d.ref);
      lot.set(
        compteur,
        {
          nb: increment(-1),
          ...(e.type === "fichier" ? { octets: increment(-(e.taille ?? 0)) } : {}),
        },
        { merge: true },
      );
      await lot.commit();
      total++;
    }
  }
  await deleteDoc(refMeta(uid));
  return total;
}
