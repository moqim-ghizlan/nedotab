import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Statistiques de visites (V4.21) contre l'émulateur Firestore.
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
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const CHEMIN = "users/alice/stats/visites";
const valide = () => ({
  poids: { a: increment(1.5) },
  compte: { a: increment(1) },
  derniere: { a: Timestamp.now() },
  majLe: serverTimestamp(),
});

describe("stats/visites", () => {
  it("le propriétaire écrit (incréments), lit et supprime", async () => {
    await assertSucceeds(setDoc(doc(db("alice"), CHEMIN), valide(), { merge: true }));
    await assertSucceeds(setDoc(doc(db("alice"), CHEMIN), valide(), { merge: true }));
    await assertSucceeds(getDoc(doc(db("alice"), CHEMIN)));
    await assertSucceeds(deleteDoc(doc(db("alice"), CHEMIN)));
  });
  it("un autre utilisateur ou un visiteur : refusé", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), CHEMIN), { poids: {}, compte: {}, derniere: {} }),
    );
    await assertFails(getDoc(doc(db("bob"), CHEMIN)));
    await assertFails(setDoc(doc(db("bob"), CHEMIN), valide()));
    await assertFails(getDoc(doc(db(null), CHEMIN)));
    await assertFails(setDoc(doc(db(null), CHEMIN), valide()));
    await assertFails(deleteDoc(doc(db("bob"), CHEMIN)));
  });
  it("champ inconnu refusé", async () => {
    await assertFails(setDoc(doc(db("alice"), CHEMIN), { ...valide(), autre: 1 }));
  });
  it("majLe différent de l'heure serveur refusé", async () => {
    await assertFails(setDoc(doc(db("alice"), CHEMIN), { ...valide(), majLe: Timestamp.fromMillis(5) }));
  });
  it("3 000 entrées acceptées, 3 001 refusées", async () => {
    const carte = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, 1]));
    const doc3 = (n) => ({
      poids: carte(n),
      compte: carte(n),
      derniere: {},
      majLe: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(db("alice"), CHEMIN), doc3(3000)));
    await assertFails(setDoc(doc(db("alice"), CHEMIN), doc3(3001)));
  });
  it("les autres chemins de stats restent fermés", async () => {
    await assertFails(setDoc(doc(db("alice"), "users/alice/stats/autre"), valide()));
  });
  it("la suppression du compte (recursiveDelete) couvre stats/visites : la règle ne protège pas le serveur", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), CHEMIN), { poids: { a: 1 }, compte: { a: 1 }, derniere: {} });
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), CHEMIN));
      const s = await getDoc(doc(ctx.firestore(), CHEMIN));
      if (s.exists()) throw new Error("le document aurait dû disparaître");
    });
  });
});
