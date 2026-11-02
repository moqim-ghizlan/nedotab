import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Vault (V4.26) contre l'émulateur Firestore.
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
  uid
    ? env.authenticatedContext(uid, { email_verified: true }).firestore()
    : env.unauthenticatedContext().firestore();
const cle = (d, uid = "alice") => doc(d, `users/${uid}/vaultMeta/cle`);
const ENV = "v1.AAAAAAAAAAAAAAAA.QUJDREVGR0hJSktMTU5PUA";
const meta = (extra = {}) => ({
  version: 1,
  sel1: "AAAAAAAAAAAAAAAAAAAAAA",
  sel2: "BBBBBBBBBBBBBBBBBBBBBB",
  iterations: 600000,
  enveloppeMdp: ENV,
  enveloppeSecours: ENV,
  creeLe: serverTimestamp(),
  ...extra,
});
const elem = (extra = {}) => ({
  type: "texte",
  contenu: ENV,
  titre: "",
  chiffre: true,
  appareil: "Chrome",
  epingle: false,
  creeLe: serverTimestamp(),
  expireLe: Timestamp.fromMillis(Date.now() + 86_400_000),
  ...extra,
});
const ajouter = (d, id, e) => {
  const lot = writeBatch(d);
  lot.set(doc(d, `users/alice/espacePartage/${id}`), e);
  lot.set(doc(d, "users/alice/espacePartageMeta/usage"), { nb: increment(1) }, { merge: true });
  return lot.commit();
};

describe("vaultMeta", () => {
  it("le propriétaire crée, lit ; les autres sont refusés", async () => {
    await assertSucceeds(setDoc(cle(db("alice")), meta()));
    await assertSucceeds(getDoc(cle(db("alice"))));
    await assertFails(getDoc(cle(db("bob"), "alice")));
    await assertFails(getDoc(cle(db(null), "alice")));
    await assertFails(setDoc(cle(db("bob"), "alice"), meta()));
  });

  it("create refusé si le vault existe déjà (pas de seconde VK)", async () => {
    await assertSucceeds(setDoc(cle(db("alice")), meta()));
    await assertFails(setDoc(cle(db("alice")), meta({ enveloppeMdp: "v1.CCCCCCCCCCCCCCCC.QUJD" })));
  });

  it("champ inconnu, texte brut ou itérations faibles refusés", async () => {
    await assertFails(setDoc(cle(db("alice")), meta({ indice: "mon chat" })));
    await assertFails(setDoc(cle(db("alice")), meta({ enveloppeMdp: "mon mot de passe" })));
    await assertFails(setDoc(cle(db("alice")), meta({ iterations: 1000 })));
    await assertFails(setDoc(cle(db("alice")), meta({ version: 2 })));
  });

  it("update limité aux champs d'enveloppe", async () => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(cle(c.firestore()), { ...meta(), creeLe: new Date() }),
    );
    await assertSucceeds(
      updateDoc(cle(db("alice")), {
        enveloppeMdp: "v1.CCCCCCCCCCCCCCCC.QUJD",
        sel1: "CCCCCCCCCCCCCCCCCCCCCC",
        majLe: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(cle(db("alice")), { iterations: 310000, majLe: serverTimestamp() }),
    );
    await assertFails(updateDoc(cle(db("alice")), { enveloppeMdp: "v1.CCCCCCCCCCCCCCCC.QUJD" })); // sans majLe
    await assertSucceeds(deleteDoc(cle(db("alice"))));
  });
});

describe("éléments chiffrés", () => {
  it("accepte une forme chiffrée valide (contenu > 20 000 caractères inclus)", async () => {
    await assertSucceeds(ajouter(db("alice"), "e1", elem()));
    await assertSucceeds(
      ajouter(db("alice"), "e2", elem({ contenu: `v1.AAAAAAAAAAAAAAAA.${"A".repeat(40000)}` })),
    );
  });
  it("refuse chiffre:true avec un contenu en clair ou un titre lisible", async () => {
    await assertFails(ajouter(db("alice"), "e1", elem({ contenu: "mon secret en clair" })));
    await assertFails(ajouter(db("alice"), "e2", elem({ titre: "divorce-avocat.pdf" })));
  });
  it("refuse un contenu clair de plus de 20 000 caractères", async () => {
    await assertFails(
      ajouter(db("alice"), "e1", elem({ chiffre: false, contenu: "x".repeat(20001), titre: "t" })),
    );
  });
});
