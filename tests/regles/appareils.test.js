import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Appareils nommés (T12) contre l'émulateur Firestore.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

const db = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ref = (d, uid = "alice", id = ID) => doc(d, `users/${uid}/appareils/${id}`);
const valide = (extra = {}) => ({
  nom: "work-pc",
  type: "extension",
  creeLe: serverTimestamp(),
  vuLe: serverTimestamp(),
  ...extra,
});

describe("règles : appareils", () => {
  it("le propriétaire crée, renomme, retire", async () => {
    await assertSucceeds(setDoc(ref(db("alice")), valide()));
    await assertSucceeds(updateDoc(ref(db("alice")), { nom: "maison" }));
    await assertSucceeds(updateDoc(ref(db("alice")), { vuLe: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref(db("alice"))));
  });
  it("nom trop long, vide, champ inconnu, type inconnu refusés", async () => {
    await assertFails(setDoc(ref(db("alice")), valide({ nom: "x".repeat(31) })));
    await assertFails(setDoc(ref(db("alice")), valide({ nom: "" })));
    await assertFails(setDoc(ref(db("alice")), valide({ secret: 1 })));
    await assertFails(setDoc(ref(db("alice")), valide({ type: "frigo" })));
    await assertFails(setDoc(ref(db("alice"), "alice", "court"), valide()));
  });
  it("un autre utilisateur ne lit ni n'écrit", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(ref(ctx.firestore()), { nom: "a", type: "ipad" }));
    await assertFails(getDoc(ref(db("bob"))));
    await assertFails(setDoc(ref(db("bob")), valide()));
    await assertFails(updateDoc(ref(db("bob")), { nom: "pirate" }));
    await assertFails(deleteDoc(ref(db("bob"))));
  });
  it("la mise à jour ne change que nom et vuLe", async () => {
    await assertSucceeds(setDoc(ref(db("alice")), valide()));
    await assertFails(updateDoc(ref(db("alice")), { type: "ipad" }));
  });
});
