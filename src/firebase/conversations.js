import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  Timestamp,
  deleteDoc,
} from "firebase/firestore";
import { CONVERSATIONS_PAR_PAGE, MESSAGES_CHARGES } from "../core/conversations.js";
import { obtenirApp } from "./app.js";
import { appelerIa } from "./ia.js";

/**
 * Conversations of the chat (V4.15): users/{uid}/conversations/{convId} and its messages.
 * The browser creates the conversation, writes its own messages and renames; the answers of
 * the assistant, the counters and the deletion with the messages are done by the functions.
 */
const racine = (uid) => collection(obtenirApp().firestore, "users", uid, "conversations");
const refConversation = (uid, convId) => doc(racine(uid), convId);
const messages = (uid, convId) => collection(refConversation(uid, convId), "messages");
const ms = (t) => t?.toMillis?.() ?? null;

const versConversation = (d) => {
  const v = d.data();
  return {
    id: d.id,
    titre: v.titre,
    apercu: v.apercu ?? "",
    nbMessages: v.nbMessages ?? 0,
    modele: v.modele ?? "",
    creeLe: ms(v.creeLe),
    majLe: ms(v.majLe),
  };
};

export const versMessage = (d) => {
  const v = d.data({ serverTimestamps: "estimate" });
  return {
    id: d.id,
    role: v.role,
    texte: v.texte,
    creeLe: ms(v.creeLe),
    etat: v.etat ?? "ok",
    ...(v.origine ? { origine: v.origine } : {}),
    ...(v.sitesCites ? { sitesCites: v.sitesCites } : {}),
  };
};

export async function creerConversation(uid, { id, titre }) {
  await setDoc(refConversation(uid, id), {
    titre,
    creeLe: serverTimestamp(),
    majLe: serverTimestamp(),
    nbMessages: 0,
    modele: "",
    apercu: "",
  });
}

export async function ecrireMessageUtilisateur(uid, convId, { id, texte, origine = null }) {
  await setDoc(doc(messages(uid, convId), id), {
    role: "user",
    texte,
    creeLe: serverTimestamp(),
    etat: "ok",
    ...(origine ? { origine } : {}),
  });
}

/** One page of the list, most recently updated first. `apres`: majLe (ms) of the last one. */
export async function listerConversations(uid, { apres = null } = {}) {
  const contraintes = [orderBy("majLe", "desc")];
  if (apres != null) contraintes.push(startAfter(Timestamp.fromMillis(apres)));
  contraintes.push(limit(CONVERSATIONS_PAR_PAGE));
  const r = await getDocs(query(racine(uid), ...contraintes));
  return {
    conversations: r.docs.map(versConversation),
    suite: r.docs.length === CONVERSATIONS_PAR_PAGE,
  };
}

export const renommerConversation = (uid, convId, titre) =>
  updateDoc(refConversation(uid, convId), { titre });

/** Deletion by the server: the conversation and all its messages, no orphan left. */
export const supprimerConversation = (convId) => appelerIa("iaSupprimerConversation", { convId });

export const supprimerMessage = (uid, convId, msgId) => deleteDoc(doc(messages(uid, convId), msgId));

/**
 * Live view of the last messages of a conversation (oldest first in the callback), so that
 * a conversation continued on another device shows up here. Works from the cache offline.
 * @returns {() => void} stops the listening
 */
export function ecouterMessages(uid, convId, rappel, surErreur) {
  return onSnapshot(
    query(messages(uid, convId), orderBy("creeLe", "desc"), limit(MESSAGES_CHARGES)),
    { includeMetadataChanges: true },
    (instantane) => rappel(instantane.docs.map(versMessage).reverse()),
    surErreur,
  );
}

/** Messages older than `avantMs`, oldest first ("Charger les précédents"). */
export async function chargerMessagesAvant(uid, convId, avantMs) {
  const r = await getDocs(
    query(
      messages(uid, convId),
      where("creeLe", "<", Timestamp.fromMillis(avantMs)),
      orderBy("creeLe", "desc"),
      limit(MESSAGES_CHARGES),
    ),
  );
  return { messages: r.docs.map(versMessage).reverse(), suite: r.docs.length === MESSAGES_CHARGES };
}

/** Everything, for the export of the data (V2.10): conversations with their messages. */
export async function lireToutesConversations(uid) {
  const liste = await getDocs(query(racine(uid), orderBy("majLe", "desc")));
  const resultat = [];
  for (const d of liste.docs) {
    const c = versConversation(d);
    const m = await getDocs(query(messages(uid, d.id), orderBy("creeLe", "asc")));
    resultat.push({ ...c, messages: m.docs.map(versMessage) });
  }
  return resultat;
}
