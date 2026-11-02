import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { PAGE_ELEMENTS, lireElement } from "../core/espacePartage.js";
import { BORNE_BASSE_MS, calculerExpiration, DUREE_DEFAUT } from "../core/expirationPartage.js";
import { deleteObject, listAll, ref } from "firebase/storage";
import { obtenirApp } from "./app.js";
import { appareilCourant } from "./sauvegardes.js";

/**
 * Sharing space (V4.24): users/{uid}/espacePartage/{id} and the counter
 * users/{uid}/espacePartageMeta/usage ({ nb }). The rules cannot count a collection: every
 * add and every removal is ONE batch that changes the element AND the counter (increment), and
 * the rule of creation checks `nb <= 200` and `nb = before + 1` with getAfter.
 *
 * A send is an explicit action (a click on "Envoyer"): written at once, not debounced. The
 * date is always serverTimestamp(), never the clock of the device.
 */
const db = () => obtenirApp().firestore;
const elements = (uid) => collection(db(), "users", uid, "espacePartage");
const meta = (uid) => doc(db(), "users", uid, "espacePartageMeta", "usage");

/**
 * Listens to the `limite` newest elements. `rappel(elements, { depuisCache, enAttente })`.
 * One listener at a time: the caller stops it when the panel closes and the tab is hidden.
 */
export function ecouterEspacePartage(uid, rappel, surErreur, limite = PAGE_ELEMENTS) {
  const q = query(elements(uid), orderBy("creeLe", "desc"), limit(limite));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (s) =>
      rappel(
        s.docs
          .map((d) =>
            lireElement(
              d.id,
              d.data({ serverTimestamps: "estimate" }),
              d.metadata.hasPendingWrites,
            ),
          )
          .filter(Boolean),
        {
          depuisCache: s.metadata.fromCache,
          enAttente: s.metadata.hasPendingWrites,
          plein: s.size >= limite,
        },
      ),
    surErreur,
  );
}

/** Counter { nb } listened to, to refuse a 201st element before sending it. */
export function ecouterCompteur(uid, rappel, surErreur) {
  return onSnapshot(
    meta(uid),
    (s) => rappel(s.exists() ? (s.data().nb ?? 0) : 0, s.exists() ? (s.data().octets ?? 0) : 0),
    surErreur,
  );
}

/**
 * Adds an element: one batch (element + counter). @returns {Promise<string>} its id.
 * The batch is queued offline and sent once, when the network is back.
 */
export async function ajouter(
  uid,
  {
    type,
    contenu,
    titre,
    appareil = appareilCourant(),
    epingle = false,
    chiffre = false,
    expireLe = calculerExpiration(DUREE_DEFAUT),
  },
  chiffrer = null,
) {
  const ref = doc(elements(uid)); // automatic id: no clash between devices
  const lot = writeBatch(db());
  // V4.26: the encryption needs the id (it is part of the authenticated data), hence the callback.
  const corps =
    chiffre && chiffrer
      ? { contenu: await chiffrer(ref.id, { contenu, titre }), titre: "", chiffre: true }
      : { contenu, titre };
  lot.set(ref, {
    type,
    ...corps,
    appareil,
    epingle,
    creeLe: serverTimestamp(),
    expireLe: Timestamp.fromMillis(expireLe),
  });
  lot.set(meta(uid), { nb: increment(1) }, { merge: true });
  await lot.commit();
  return ref.id;
}

/** An element sent twice goes back to the top (decision 5: no duplicate). */
export async function remonter(uid, id) {
  await updateDoc(doc(elements(uid), id), { creeLe: serverTimestamp() });
}

export async function epingler(uid, id, epingle) {
  await updateDoc(doc(elements(uid), id), { epingle: !!epingle });
}

/** Removes an element and decrements the counter (one batch). */
export async function supprimer(uid, id) {
  const lot = writeBatch(db());
  lot.delete(doc(elements(uid), id));
  lot.set(meta(uid), { nb: increment(-1) }, { merge: true });
  await lot.commit();
}

/** Puts a removed element back (the "Annuler" of the toast): same content, same pin. */
export async function restaurer(uid, e) {
  // The rule wants at least 55 minutes ahead: an item nearly over gets one more hour.
  return ajouter(uid, {
    ...e,
    expireLe: Math.max(e.expireLe ?? 0, Date.now() + BORNE_BASSE_MS + 5 * 60_000),
  });
}

/** V4.27: new expiry (ms) of one item (extension). */
export async function prolonger(uid, id, expireLe) {
  await updateDoc(doc(elements(uid), id), { expireLe: Timestamp.fromMillis(expireLe) });
}

/** V4.27: gives an expiry to items created before V4.27, with the user's agreement. */
export async function migrerExpiration(uid, ids, expireLe) {
  for (let i = 0; i < ids.length; i += 400) {
    const lot = writeBatch(db());
    ids
      .slice(i, i + 400)
      .forEach((id) =>
        lot.update(doc(elements(uid), id), { expireLe: Timestamp.fromMillis(expireLe) }),
      );
    await lot.commit();
  }
}

/** Empties the space, by batches of 400 documents; the counter goes to 0. */
export async function viderTout(uid) {
  for (;;) {
    const s = await getDocs(query(elements(uid), limit(400)));
    if (s.empty) break;
    const lot = writeBatch(db());
    s.docs.forEach((d) => lot.delete(d.ref));
    await lot.commit();
  }
  // The files of the space go too (V4.25), then both counters are zero.
  const racine = await listAll(ref(obtenirApp().stockage, `partages/${uid}`)).catch(() => null);
  for (const dossier of racine?.prefixes ?? []) {
    const contenu = await listAll(dossier).catch(() => ({ items: [] }));
    for (const item of contenu.items) await deleteObject(item).catch(() => {});
  }
  await setDoc(meta(uid), { nb: 0, octets: 0 });
}

/** Recounts the documents and corrects the counter (after a network error). @returns {number} */
export async function recalculerCompteur(uid) {
  const n = (await getCountFromServer(elements(uid))).data().count;
  await setDoc(meta(uid), { nb: Math.min(n, 200) });
  return n;
}

/** The next elements after `dernier` (a "Voir plus" page of 50). */
export async function lirePage(uid, dernierCreeLe, taille = PAGE_ELEMENTS) {
  const q = query(
    elements(uid),
    orderBy("creeLe", "desc"),
    startAfter(new Date(dernierCreeLe)),
    limit(taille),
  );
  const s = await getDocs(q);
  return {
    elements: s.docs.map((d) => lireElement(d.id, d.data())).filter(Boolean),
    plein: s.size >= taille,
  };
}

/** Every element, for the export of the user's data. */
export async function lireTout(uid) {
  const s = await getDocs(query(elements(uid), orderBy("creeLe", "desc")));
  return s.docs.map((d) => lireElement(d.id, d.data())).filter(Boolean);
}

/** Deletes one element without touching the counter (maintenance only). */
export const supprimerBrut = (uid, id) => deleteDoc(doc(elements(uid), id));
