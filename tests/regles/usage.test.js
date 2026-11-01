import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Statistics of use and cache of the AI answers (V4.19) against the Firestore emulator.
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

describe("usage et cache IA", () => {
  it("l'utilisateur lit son usage ; personne d'autre ; aucune écriture depuis le navigateur", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "users/alice/usage/2026-11"), { total: { appels: 3 } }),
    );
    await assertSucceeds(getDoc(doc(db("alice"), "users/alice/usage/2026-11")));
    await assertFails(getDoc(doc(db("bob"), "users/alice/usage/2026-11")));
    await assertFails(getDoc(doc(db(null), "users/alice/usage/2026-11")));
    await assertFails(setDoc(doc(db("alice"), "users/alice/usage/2026-12"), { total: { appels: 0 } }));
    await assertFails(updateDoc(doc(db("alice"), "users/alice/usage/2026-11"), { total: { appels: 0 } }));
    await assertFails(setDoc(doc(db("bob"), "users/alice/usage/2026-11"), { total: { appels: 0 } }));
  });

  it("le cache IA (prive/cacheIa) est fermé en lecture et en écriture", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "users/alice/prive/cacheIa/entrees/h1"), { reponse: { tags: ["a"] } }),
    );
    await assertFails(getDoc(doc(db("alice"), "users/alice/prive/cacheIa/entrees/h1")));
    await assertFails(setDoc(doc(db("alice"), "users/alice/prive/cacheIa/entrees/h2"), { reponse: {} }));
  });
});
