import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadString, getBytes } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env?.cleanup());

describe("règles V2.0 : tout est fermé", () => {
  it("Firestore : lecture et écriture refusées, même connecté", async () => {
    const connecte = env.authenticatedContext("alice").firestore();
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(connecte, "users/alice")));
    await assertFails(setDoc(doc(connecte, "users/alice"), { grille: [] }));
    await assertFails(getDoc(doc(anonyme, "users/alice")));
  });
  it("Storage : lecture et écriture refusées", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadString(ref(s, "users/alice/fonds/a.webp"), "x"));
    await assertFails(getBytes(ref(s, "users/alice/fonds/a.webp")));
  });
});
