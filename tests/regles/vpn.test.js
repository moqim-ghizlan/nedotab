import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// V5.2: le client ne peut NI lire NI écrire vpn/** (même un administrateur, même un invité) ;
// un compte dont l'e-mail n'est pas vérifié non plus. Seules les fonctions (Admin SDK) y accèdent.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

const CHEMINS = [
  "vpn/config",
  "vpn/etat",
  "vpn/config/invitations/abc123",
  "vpn/config/acces/alice",
];

const contextes = () => [
  ["invité vérifié", env.authenticatedContext("alice", { email_verified: true })],
  ["administrateur", env.authenticatedContext("patron", { email_verified: true, admin: true })],
  ["e-mail non vérifié", env.authenticatedContext("alice", { email_verified: false })],
  ["anonyme", env.unauthenticatedContext()],
];

describe("vpn/** : fonctions seulement", () => {
  it.each(CHEMINS)("%s : lecture et écriture refusées à tout le monde", async (chemin) => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), chemin), { actif: true, compte: "u_x", empreinte: "$2y$secret" }),
    );
    for (const [, contexte] of contextes()) {
      const d = contexte.firestore();
      await assertFails(getDoc(doc(d, chemin)));
      await assertFails(setDoc(doc(d, chemin), { actif: true }));
    }
  });

  it("les collections ne se listent pas non plus", async () => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), "vpn/config/acces/alice"), { actif: true }),
    );
    for (const [, contexte] of contextes())
      await assertFails(getDocs(collection(contexte.firestore(), "vpn/config/acces")));
  });

  it("non-régression : un utilisateur lit toujours son propre document", async () => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), "users/alice"), { versionSchema: 1 }),
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext("alice", { email_verified: true }).firestore(), "users/alice")),
    );
  });
});
