import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
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

/**
 * "Aujourd'hui" view (V6.5): the todos still to do due by the end of the week, all subjects, by due
 * date, 200 at most. Index: `fait` + `echeance` (firestore.indexes.json). A todo without a due
 * date holds `null` and is never returned: that is wanted.
 */
export function ecouterAujourdhui(uid, finSemaine, rappel, surErreur, taille = 200) {
  return onSnapshot(
    query(
      todos(uid),
      where("fait", "==", false),
      where("echeance", "<=", finSemaine),
      orderBy("echeance"),
      limit(taille),
    ),
    { includeMetadataChanges: true },
    (s) =>
      rappel(
        s.docs
          .map((d) =>
            lireTodo(d.id, d.data({ serverTimestamps: "estimate" }), d.metadata.hasPendingWrites),
          )
          .filter(Boolean),
        { depuisCache: s.metadata.fromCache, plein: s.size >= taille },
      ),
    surErreur,
  );
}

/** Number of todos still to do due before `aujourdhui` ("en retard"): one counting query. */
export async function compterEnRetard(uid, aujourdhui) {
  const s = await getCountFromServer(
    query(todos(uid), where("fait", "==", false), where("echeance", "<", aujourdhui)),
  );
  return s.data().count;
}

/**
 * A page of todos of every subject, newest first (search in "Tous les sujets": an explicit
 * button, 100 at a time, so the cost is visible).
 */
export async function lirePageTous(uid, dernierCreeLe = null, taille = PAGE_TODOS) {
  const base = [todos(uid), orderBy("creeLe", "desc")];
  if (dernierCreeLe != null) base.push(startAfter(new Date(dernierCreeLe)));
  const s = await getDocs(query(...base, limit(taille)));
  return {
    todos: s.docs.map((d) => lireTodo(d.id, d.data())).filter(Boolean),
    plein: s.size >= taille,
  };
}

/** Does the todo still exist? (An update refused by the rules on a missing document looks like a refusal.) */
export async function todoExiste(uid, id) {
  return (await getDoc(doc(todos(uid), id))).exists();
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
  // A creation queued offline can be refused when it finally arrives (the counter moved in the
  // meantime): the counters are recounted once and the creation is tried again, then a clear error.
  await apresRecalcul(uid, async () => {
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
  });
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
  await apresRecalcul(uid, () => ecrireCreation(uid, todo, id));
  return id;
}

async function ecrireCreation(uid, todo, id) {
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
 * Adds the subjects and the todos of an import (V6.7): NEVER replaces anything, every identifier
 * is new. One creation = one batch (the rules check the counter by +1), so it runs one after the
 * other; `surProgres(fait, total)` and `annule()` let the interface show and stop it.
 * @returns {Promise<{ sujets: number, todos: number, annule: boolean }>}
 */
export async function importerTodos(uid, plan, { surProgres, annule = () => false } = {}) {
  const existants = await getDocs(sujets(uid));
  let ordreSujet = Math.max(0, ...existants.docs.map((d) => d.data().ordre ?? 0));
  const total = plan.sujets.length + plan.todos.length;
  let fait = 0;
  const correspondance = new Map(); // id in the file -> new id
  const sujetsTries = [...plan.sujets].sort((a, b) => a.ordre - b.ordre);
  for (const s of sujetsTries) {
    if (annule()) break;
    ordreSujet += 1000;
    const id = await creerSujet(uid, { nom: s.nom, ordre: ordreSujet, couleur: s.couleur });
    correspondance.set(s.ancienId, id);
    surProgres?.(++fait, total);
  }
  const rangs = new Map();
  let crees = 0;
  for (const t of [...plan.todos].sort((a, b) => a.ordre - b.ordre)) {
    if (annule()) break;
    const sujetId = correspondance.get(t.ancienSujetId);
    if (!sujetId) continue;
    const ordre = (rangs.get(sujetId) ?? 0) + 1000;
    rangs.set(sujetId, ordre);
    await creerTodo(uid, {
      v: 1,
      sujetId,
      titre: t.titre,
      description: t.description,
      echeance: t.echeance,
      fait: t.fait,
      ordre,
      images: [],
    });
    crees++;
    surProgres?.(++fait, total);
  }
  return { sujets: correspondance.size, todos: crees, annule: annule() };
}

/**
 * Removes EVERY todo and subject of the account ("Supprimer tous mes todos"): the files of the
 * pictures first, then the documents by batches of 400, then the counters at zero. Can be run
 * again after a failure.
 */
export async function toutSupprimer(uid, { surProgres } = {}) {
  let supprimes = 0;
  for (;;) {
    const s = await getDocs(query(todos(uid), limit(TAILLE_LOT)));
    if (s.empty) break;
    const lus = s.docs.map((d) => lireTodo(d.id, d.data())).filter(Boolean);
    const images = lus.flatMap((t) => t.images);
    if (images.length) await supprimerFichiers(images);
    const lot = writeBatch(db());
    s.docs.forEach((d) => lot.delete(d.ref));
    await lot.commit();
    supprimes += s.size;
    surProgres?.(supprimes);
  }
  for (;;) {
    const s = await getDocs(query(sujets(uid), limit(TAILLE_LOT)));
    if (s.empty) break;
    const lot = writeBatch(db());
    s.docs.forEach((d) => lot.delete(d.ref));
    await lot.commit();
  }
  await setDoc(meta(uid), { nbSujets: 0, nbTodos: 0, octets: 0 });
  return supprimes;
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
