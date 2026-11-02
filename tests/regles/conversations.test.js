import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Rules of the conversations (V4.15) against the Firestore emulator.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

const db = (uid) =>
  uid ? env.authenticatedContext(uid, { email_verified: true }).firestore() : env.unauthenticatedContext().firestore();
const conversation = (extra = {}) => ({
  titre: "Mon DNS",
  creeLe: serverTimestamp(),
  majLe: serverTimestamp(),
  nbMessages: 0,
  modele: "",
  apercu: "",
  ...extra,
});
const message = (extra = {}) => ({
  role: "user",
  texte: "Bonjour",
  creeLe: serverTimestamp(),
  etat: "ok",
  ...extra,
});
const chemin = (uid = "alice") => `users/${uid}/conversations/c1`;

/** A conversation and a message of the assistant, as the server writes them (rules bypassed). */
async function preparer() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, chemin()), {
      titre: "Existante",
      creeLe: new Date(),
      majLe: new Date(),
      nbMessages: 2,
      modele: "m",
      apercu: "…",
    });
    await setDoc(doc(d, `${chemin()}/messages/m1`), {
      role: "assistant",
      texte: "Réponse",
      creeLe: new Date(),
      etat: "ok",
    });
    await setDoc(doc(d, `${chemin()}/messages/p1`), {
      role: "assistant",
      texte: "Je propose",
      creeLe: new Date(),
      etat: "ok",
      proposition: { id: "x", actions: [{ outil: "creer_dossier", titre: "A", parent: null, sites: [] }] },
      statutProposition: "en_attente",
    });
  });
}

describe("conversations : lecture et suppression", () => {
  it("le propriétaire lit et supprime ; un autre utilisateur ou un anonyme : refusé", async () => {
    await preparer();
    await assertSucceeds(getDoc(doc(db("alice"), chemin())));
    await assertSucceeds(getDoc(doc(db("alice"), `${chemin()}/messages/m1`)));
    await assertFails(getDoc(doc(db("bob"), chemin("alice"))));
    await assertFails(getDoc(doc(db("bob"), `${chemin("alice")}/messages/m1`)));
    await assertFails(getDoc(doc(db(null), chemin("alice"))));
    await assertFails(deleteDoc(doc(db("bob"), chemin("alice"))));
    await assertSucceeds(deleteDoc(doc(db("alice"), `${chemin()}/messages/m1`)));
    await assertSucceeds(deleteDoc(doc(db("alice"), chemin())));
  });
});

describe("conversations : création et renommage", () => {
  it("création valide ; chez un autre, champ en trop, titre trop long ou vide, compteur : refusés", async () => {
    await assertSucceeds(setDoc(doc(db("alice"), chemin()), conversation()));
    await assertFails(setDoc(doc(db("bob"), chemin("alice")), conversation()));
    await assertFails(setDoc(doc(db("alice"), "users/alice/conversations/c2"), conversation({ extra: 1 })));
    await assertFails(
      setDoc(doc(db("alice"), "users/alice/conversations/c3"), conversation({ titre: "x".repeat(81) })),
    );
    await assertFails(
      setDoc(doc(db("alice"), "users/alice/conversations/c4"), conversation({ titre: "" })),
    );
    await assertFails(
      setDoc(doc(db("alice"), "users/alice/conversations/c5"), conversation({ nbMessages: 99 })),
    );
    await assertFails(
      setDoc(doc(db("alice"), "users/alice/conversations/c6"), conversation({ creeLe: new Date(0) })),
    );
  });

  it("renommer : oui ; modifier nbMessages, majLe ou apercu : refusé", async () => {
    await preparer();
    const ref = doc(db("alice"), chemin());
    await assertSucceeds(updateDoc(ref, { titre: "Nouveau titre" }));
    await assertFails(updateDoc(ref, { titre: "" }));
    await assertFails(updateDoc(ref, { titre: "x".repeat(81) }));
    await assertFails(updateDoc(ref, { nbMessages: 0 }));
    await assertFails(updateDoc(ref, { majLe: serverTimestamp() }));
    await assertFails(updateDoc(ref, { apercu: "faux" }));
    await assertFails(updateDoc(ref, { titre: "ok", nbMessages: 5 }));
    await assertFails(updateDoc(doc(db("bob"), chemin("alice")), { titre: "pirate" }));
  });
});

describe("conversations : messages", () => {
  it("message de l'utilisateur valide, avec ou sans origine", async () => {
    await preparer();
    await assertSucceeds(setDoc(doc(db("alice"), `${chemin()}/messages/u1`), message()));
    await assertSucceeds(
      setDoc(doc(db("alice"), `${chemin()}/messages/u2`), message({ origine: "barre" })),
    );
  });

  it("un message « assistant » écrit par le navigateur est refusé", async () => {
    await preparer();
    await assertFails(
      setDoc(doc(db("alice"), `${chemin()}/messages/a1`), message({ role: "assistant" })),
    );
  });

  it("texte vide ou trop long, heure du client, état, champ en trop, origine inconnue : refusés", async () => {
    await preparer();
    const ecrire = (id, extra) => setDoc(doc(db("alice"), `${chemin()}/messages/${id}`), message(extra));
    await assertFails(ecrire("x1", { texte: "" }));
    await assertFails(ecrire("x2", { texte: "a".repeat(4001) }));
    await assertFails(ecrire("x3", { creeLe: new Date(0) }));
    await assertFails(ecrire("x4", { etat: "interrompu" }));
    await assertFails(ecrire("x5", { sitesCites: ["a"] }));
    await assertFails(ecrire("x6", { origine: "autre" }));
    await assertSucceeds(ecrire("ok", { texte: "a".repeat(4000) }));
  });

  it("dans la conversation d'un autre, ou dans une conversation inexistante : refusé", async () => {
    await preparer();
    await assertFails(setDoc(doc(db("bob"), `${chemin("alice")}/messages/b1`), message()));
    await assertFails(setDoc(doc(db("alice"), "users/alice/conversations/absente/messages/z"), message()));
  });

  it("un message n'est jamais modifié (hors statut de proposition)", async () => {
    await preparer();
    await assertSucceeds(setDoc(doc(db("alice"), `${chemin()}/messages/u1`), message()));
    await assertFails(updateDoc(doc(db("alice"), `${chemin()}/messages/u1`), { texte: "autre" }));
    await assertFails(updateDoc(doc(db("alice"), `${chemin()}/messages/m1`), { texte: "faux" }));
  });

  it("proposition : le navigateur change seulement le statut, une seule fois", async () => {
    await preparer();
    const p1 = () => doc(db("alice"), `${chemin()}/messages/p1`);
    // not the text, not the actions, not a status that does not exist, not by someone else
    await assertFails(updateDoc(p1(), { texte: "autre" }));
    await assertFails(updateDoc(p1(), { proposition: { id: "x", actions: [] } }));
    await assertFails(updateDoc(p1(), { statutProposition: "n-importe-quoi" }));
    await assertFails(updateDoc(p1(), { statutProposition: "appliquee", texte: "autre" }));
    await assertFails(updateDoc(doc(db("bob"), `${chemin("alice")}/messages/p1`), { statutProposition: "appliquee" }));
    // a message without proposal has no status to change
    await assertFails(
      updateDoc(doc(db("alice"), `${chemin()}/messages/m1`), { statutProposition: "appliquee" }),
    );
    await assertSucceeds(updateDoc(p1(), { statutProposition: "appliquee" }));
    // applied once: neither back to "en_attente" nor to another status
    await assertFails(updateDoc(p1(), { statutProposition: "en_attente" }));
    await assertFails(updateDoc(p1(), { statutProposition: "ignoree" }));
  });
});
