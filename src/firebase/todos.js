import {
  collection,
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
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { octetsDesImages } from "../core/imagesTodo.js";
import { lireSujet } from "../core/sujets.js";
import { PAGE_TODOS, lireTodo } from "../core/todos.js";
import { obtenirApp } from "./app.js";
import { supprimerDossierTodo, supprimerFichiers } from "./todosImages.js";

/**
 * Todos (V6.0): users/{uid}/sujets/{id}, users/{uid}/todos/{id} (flat, with a `sujetId` field:
 * moving a todo is changing one field) and the counters users/{uid}/todosMeta/usage
 * ({ nbSujets, nbTodos, octets }). Nothing is added to the document users/{uid}.
 *
 * The rules cannot count a collection: every creation is ONE batch that writes the document AND
 * the counter (getAfter), a removal too. Dates are always serverTimestamp(), never the clock of
 * the device. An update sends ONLY the fields that changed (+ modifieLe), so two devices that
 * change different fields never overwrite each other. Nothing here logs a title, a description
 * or a note: an invalid document is skipped silently, and counted in `ignores`.
 */
const db = () => obtenirApp().firestore;
const racine = (uid, nom) => collection(db(), "users", uid, nom);
const sujets = (uid) => racine(uid, "sujets");
const todos = (uid) => racine(uid, "todos");
const meta = (uid) => doc(db(), "users", uid, "todosMeta", "usage");

/** Size of a batch: Firestore accepts 500 operations, 400 leaves room for the counter. */
export const TAILLE_LOT = 400;

/** A new id, generated on the device so that the next writes can be queued offline. */
export const nouvelIdTodo = (uid) => doc(todos(uid)).id;
export const nouvelIdSujet = (uid) => doc(sujets(uid)).id;

// --- Reading -------------------------------------------------------------------------------------

/**
 * Listens to the subjects. `rappel(sujets, { depuisCache, enAttente })`. One listener at a time:
 * the caller stops it when the panel closes and the tab is hidden.
 */
export function ecouterSujets(uid, rappel, surErreur) {
  return onSnapshot(
    query(sujets(uid), orderBy("ordre")),
    { includeMetadataChanges: true },
    (s) =>
      rappel(
        s.docs
          .map((d) =>
            lireSujet(d.id, d.data({ serverTimestamps: "estimate" }), d.metadata.hasPendingWrites),
          )
          .filter(Boolean),
        { depuisCache: s.metadata.fromCache, enAttente: s.metadata.hasPendingWrites },
      ),
    surErreur,
  );
}

/**
 * Listens to the `taille` first todos of a subject, in manual order (index sujetId + ordre).
 * `rappel(todos, { depuisCache, enAttente, plein })`; `plein` = more may exist ("Voir plus").
 */
export function ecouterTodos(uid, sujetId, rappel, surErreur, taille = PAGE_TODOS) {
  return onSnapshot(
    query(todos(uid), where("sujetId", "==", sujetId), orderBy("ordre"), limit(taille)),
    { includeMetadataChanges: true },
    (s) =>
      rappel(
        s.docs
          .map((d) =>
            lireTodo(d.id, d.data({ serverTimestamps: "estimate" }), d.metadata.hasPendingWrites),
          )
          .filter(Boolean),
        {
          depuisCache: s.metadata.fromCache,
          enAttente: s.metadata.hasPendingWrites,
          plein: s.size >= taille,
        },
      ),
    surErreur,
  );
}

/** Counters { nbSujets, nbTodos, octets } listened to, to refuse a 31st subject or a 501st todo. */
export function ecouterCompteurs(uid, rappel, surErreur) {
  return onSnapshot(
    meta(uid),
    (s) => {
      const d = s.exists() ? s.data() : {};
      rappel({ nbSujets: d.nbSujets ?? 0, nbTodos: d.nbTodos ?? 0, octets: d.octets ?? 0 });
    },
    surErreur,
  );
}

/** Todos of a subject after `dernierOrdre` (a "Voir plus" page). */
export async function lirePageTodos(uid, sujetId, dernierOrdre, taille = PAGE_TODOS) {
  const s = await getDocs(
    query(
      todos(uid),
      where("sujetId", "==", sujetId),
      orderBy("ordre"),
      startAfter(dernierOrdre),
      limit(taille),
    ),
  );
  return {
    todos: s.docs.map((d) => lireTodo(d.id, d.data())).filter(Boolean),
    plein: s.size >= taille,
  };
}

/** Every subject and todo, for the export of the user's data. */
export async function lireTout(uid) {
  const [a, b] = await Promise.all([getDocs(sujets(uid)), getDocs(todos(uid))]);
  const lus = {
    sujets: a.docs.map((d) => lireSujet(d.id, d.data())).filter(Boolean),
    todos: b.docs.map((d) => lireTodo(d.id, d.data())).filter(Boolean),
  };
  return { ...lus, ignores: a.size + b.size - lus.sujets.length - lus.todos.length };
}

// --- Subjects --------------------------------------------------------------------------------

/** New subject: one batch (subject + counter). @returns {Promise<string>} its id. */
export async function creerSujet(uid, { nom, ordre, couleur = null }, id = nouvelIdSujet(uid)) {
  const lot = writeBatch(db());
  lot.set(doc(sujets(uid), id), {
    nom,
    ordre,
    couleur,
    nbRestants: 0,
    nbTotal: 0,
    creeLe: serverTimestamp(),
    modifieLe: serverTimestamp(),
  });
  lot.set(meta(uid), { nbSujets: increment(1) }, { merge: true });
  await lot.commit();
  return id;
}

/** Changes of a subject (name, colour, order): only the sent fields are written. */
export async function majSujet(uid, id, champs) {
  await updateDoc(doc(sujets(uid), id), { ...champs, modifieLe: serverTimestamp() });
}

/**
 * Removes a subject and all its todos: no cascade exists in Firestore, so the todos go first, by
 * batches of 400 each with its counter, and the subject last. Safe to run again after a failure
 * (a failed batch leaves the subject in place). `avantLot(todos)` lets V6.4 delete the image
 * files before their documents. @returns {Promise<number>} todos removed
 */
export async function supprimerSujet(uid, id, { avantLot, surProgres } = {}) {
  let supprimes = 0;
  for (;;) {
    const s = await getDocs(query(todos(uid), where("sujetId", "==", id), limit(TAILLE_LOT)));
    if (s.empty) break;
    const lus = s.docs.map((d) => lireTodo(d.id, d.data())).filter(Boolean);
    if (avantLot) await avantLot(lus);
    // The files go BEFORE the documents (V6.4): a failure leaves the todos, the run can start again.
    const images = lus.flatMap((t) => t.images);
    if (images.length) await supprimerFichiers(images);
    const octets = octetsDesImages(images);
    await apresRecalcul(uid, async () => {
      const lot = writeBatch(db());
      s.docs.forEach((d) => lot.delete(d.ref));
      lot.set(
        meta(uid),
        { nbTodos: increment(-s.size), ...(octets ? { octets: increment(-octets) } : {}) },
        { merge: true },
      );
      await lot.commit();
    });
    supprimes += s.size;
    surProgres?.(supprimes);
  }
  await apresRecalcul(uid, async () => {
    const lot = writeBatch(db());
    lot.delete(doc(sujets(uid), id));
    lot.set(meta(uid), { nbSujets: increment(-1) }, { merge: true });
    await lot.commit();
  });
  return supprimes;
}

// --- Todos -----------------------------------------------------------------------------------

/**
 * New todo: one batch (todo + counter). `todo` comes from core/todos.js creerTodo(). The id may
 * be given (lazy creation of the editor, V6.3). @returns {Promise<string>} its id.
 */
export async function creerTodo(uid, todo, id = nouvelIdTodo(uid)) {
  const lot = writeBatch(db());
  lot.set(doc(todos(uid), id), {
    v: todo.v,
    sujetId: todo.sujetId,
    titre: todo.titre,
    description: todo.description,
    echeance: todo.echeance ?? null,
    fait: !!todo.fait,
    faitLe: todo.fait ? serverTimestamp() : null,
    ordre: todo.ordre,
    images: todo.images ?? [],
    creeLe: serverTimestamp(),
    modifieLe: serverTimestamp(),
  });
  lot.set(meta(uid), { nbTodos: increment(1) }, { merge: true });
  // V6.1: the counters of the subject move in the same batch (no need to read every todo).
  lot.update(doc(sujets(uid), todo.sujetId), {
    nbTotal: increment(1),
    nbRestants: increment(todo.fait ? 0 : 1),
  });
  await lot.commit();
  return id;
}

/**
 * Partial update: `champs` holds ONLY what changed (see champsModifies). `fait` also writes
 * `faitLe` (server date when it becomes true, null when it becomes false).
 */
export async function majTodo(uid, id, champs, { sujetId } = {}) {
  const ecrit = { ...champs };
  if ("fait" in ecrit) ecrit.faitLe = ecrit.fait ? serverTimestamp() : null;
  else delete ecrit.faitLe;
  const donnees = { ...ecrit, modifieLe: serverTimestamp() };
  // Ticking a todo moves the "remaining" counter of its subject in the same batch.
  if ("fait" in ecrit && sujetId) {
    const lot = writeBatch(db());
    lot.update(doc(todos(uid), id), donnees);
    lot.update(doc(sujets(uid), sujetId), { nbRestants: increment(ecrit.fait ? -1 : 1) });
    await lot.commit();
    return;
  }
  await updateDoc(doc(todos(uid), id), donnees);
}

/**
 * A removal must always work: when the rules refuse it because a counter had drifted below zero,
 * the counters are recounted once and the removal is tried again.
 */
export async function apresRecalcul(uid, action) {
  try {
    return await action();
  } catch (e) {
    if (e?.code !== "permission-denied") throw e;
    await recalculerCompteurs(uid);
    return action();
  }
}

/** Removes a todo and decrements the counter (one batch). */
export async function supprimerTodo(uid, id, { sujetId, fait, images = [] } = {}) {
  // The files first (V6.4), then the document: if the files fail, nothing is lost and it can run again.
  if (images.length) await supprimerFichiers(images);
  await supprimerDossierTodo(uid, id).catch(() => {});
  const octets = octetsDesImages(images);
  return apresRecalcul(uid, async () => {
    const lot = writeBatch(db());
    lot.delete(doc(todos(uid), id));
    lot.set(
      meta(uid),
      { nbTodos: increment(-1), ...(octets ? { octets: increment(-octets) } : {}) },
      { merge: true },
    );
    if (sujetId) {
      // The subject may be gone (deleted on another device): then only the todo is removed.
      lot.update(doc(sujets(uid), sujetId), {
        nbTotal: increment(-1),
        nbRestants: increment(fait ? 0 : -1),
      });
    }
    await lot.commit();
  });
}

/**
 * Moves a todo to another subject: its `sujetId`, its place in the new list and the counters of
 * the TWO subjects, in one batch. If the destination is gone, the batch fails and nothing moves.
 */
export async function deplacerTodo(uid, id, { depuis, vers, ordre, fait }) {
  const lot = writeBatch(db());
  lot.update(doc(todos(uid), id), { sujetId: vers, ordre, modifieLe: serverTimestamp() });
  lot.update(doc(sujets(uid), depuis), {
    nbTotal: increment(-1),
    nbRestants: increment(fait ? 0 : -1),
  });
  lot.update(doc(sujets(uid), vers), {
    nbTotal: increment(1),
    nbRestants: increment(fait ? 0 : 1),
  });
  await lot.commit();
}

/** Writes new orders in batches of 400 (renumbering when the gap is exhausted). */
export async function ecrireOrdres(uid, nature, ordres) {
  const entrees = [...ordres];
  const collec = nature === "sujets" ? sujets(uid) : todos(uid);
  for (let i = 0; i < entrees.length; i += TAILLE_LOT) {
    const lot = writeBatch(db());
    for (const [id, ordre] of entrees.slice(i, i + TAILLE_LOT))
      lot.update(doc(collec, id), { ordre, modifieLe: serverTimestamp() });
    await lot.commit();
  }
}

/**
 * Recounts the subjects and the todos and corrects the counters (after a drift). The size of the
 * images (`octets`) is kept: only the reconciliation of V6.4 can recompute it.
 * @returns {Promise<{ nbSujets: number, nbTodos: number }>}
 */
export async function recalculerCompteurs(uid) {
  const [a, b] = await Promise.all([
    getCountFromServer(sujets(uid)),
    getCountFromServer(todos(uid)),
  ]);
  // The weight of the pictures is the sum of the sizes written in the todos.
  const octets = (await getDocs(todos(uid))).docs.reduce(
    (somme, d) => somme + octetsDesImages(lireTodo(d.id, d.data())?.images),
    0,
  );
  const compteurs = { nbSujets: a.data().count, nbTodos: b.data().count };
  await setDoc(meta(uid), { ...compteurs, octets }, { merge: true });
  // Counters of each subject (total and remaining), by counting queries.
  for (const s of (await getDocs(sujets(uid))).docs) {
    const [total, restants] = await Promise.all([
      getCountFromServer(query(todos(uid), where("sujetId", "==", s.id))),
      getCountFromServer(query(todos(uid), where("sujetId", "==", s.id), where("fait", "==", false))),
    ]);
    await updateDoc(s.ref, { nbTotal: total.data().count, nbRestants: restants.data().count });
  }
  return compteurs;
}
