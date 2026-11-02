import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Espace de partage (V4.24) contre l'émulateur Firestore.
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
const elem = (extra = {}) => ({
  type: "texte",
  contenu: "bonjour",
  titre: "bonjour",
  appareil: "Chrome",
  epingle: false,
  creeLe: serverTimestamp(),
  expireLe: Timestamp.fromMillis(Date.now() + 86_400_000),
  ...extra,
});
const meta = (d, uid = "alice") => doc(d, `users/${uid}/espacePartageMeta/usage`);
const el = (d, id, uid = "alice") => doc(d, `users/${uid}/espacePartage/${id}`);

/** The batch of the app: the element AND the counter (+1). */
const ajouter = (d, id, extra = {}) => {
  const lot = writeBatch(d);
  lot.set(el(d, id), elem(extra));
  lot.set(meta(d), { nb: increment(1) }, { merge: true });
  return lot.commit();
};
const remplirCompteur = (nb) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(meta(ctx.firestore()), { nb }));

describe("espacePartage", () => {
  it("le propriétaire ajoute (élément + compteur), lit, épingle et supprime", async () => {
    await assertSucceeds(ajouter(db("alice"), "e1"));
    await assertSucceeds(getDoc(el(db("alice"), "e1")));
    await assertSucceeds(updateDoc(el(db("alice"), "e1"), { epingle: true }));
    const d = db("alice");
    const lot = writeBatch(d);
    lot.delete(el(d, "e1"));
    lot.set(meta(d), { nb: increment(-1) }, { merge: true });
    await assertSucceeds(lot.commit());
  });
  it("un autre utilisateur ou un visiteur : refusé en lecture et en écriture", async () => {
    await ajouter(db("alice"), "e1");
    for (const d of [db("bob"), db(null)]) {
      await assertFails(getDoc(el(d, "e1")));
      await assertFails(setDoc(el(d, "e2"), elem()));
      await assertFails(deleteDoc(el(d, "e1")));
      await assertFails(getDoc(meta(d)));
    }
    await assertFails(ajouter(db("bob"), "e3"));
  });
  it("champ inconnu, type inconnu, contenu vide ou trop long : refusé", async () => {
    await assertFails(ajouter(db("alice"), "a", { autre: 1 }));
    await assertFails(ajouter(db("alice"), "b", { type: "autre" }));
    await assertFails(ajouter(db("alice"), "c", { contenu: "" }));
    await assertFails(ajouter(db("alice"), "d", { contenu: "x".repeat(20001) }));
    await assertSucceeds(ajouter(db("alice"), "e", { contenu: "x".repeat(20000) }));
    await assertFails(ajouter(db("alice"), "f", { appareil: "x".repeat(65) }));
  });
  it("creeLe falsifié refusé", async () => {
    await assertFails(ajouter(db("alice"), "a", { creeLe: Timestamp.fromMillis(5) }));
  });
  it("le 201e élément est refusé", async () => {
    await remplirCompteur(200);
    await assertFails(ajouter(db("alice"), "x"));
    await remplirCompteur(199);
    await assertSucceeds(ajouter(db("alice"), "y"));
  });
  it("compteur incohérent refusé : élément sans compteur, ou compteur de +2", async () => {
    await assertFails(setDoc(el(db("alice"), "sans"), elem()));
    const d = db("alice");
    const lot = writeBatch(d);
    lot.set(el(d, "z"), elem());
    lot.set(meta(d), { nb: increment(2) }, { merge: true });
    await assertFails(lot.commit());
  });
  it("concurrence : deux ajouts simultanés au 200e, un seul passe", async () => {
    await remplirCompteur(199);
    const [a, b] = await Promise.allSettled([ajouter(db("alice"), "p"), ajouter(db("alice"), "q")]);
    const reussis = [a, b].filter((r) => r.status === "fulfilled").length;
    if (reussis !== 1) throw new Error(`${reussis} ajouts ont réussi au lieu d'un seul`);
  });
  it("on ne modifie pas le contenu d'un élément", async () => {
    await ajouter(db("alice"), "e1");
    await assertFails(updateDoc(el(db("alice"), "e1"), { contenu: "autre" }));
    await assertSucceeds(updateDoc(el(db("alice"), "e1"), { creeLe: serverTimestamp() }));
    await assertFails(updateDoc(el(db("alice"), "e1"), { creeLe: Timestamp.fromMillis(7) }));
  });
  it("le compteur ne peut pas dépasser 200 ni être négatif ni porter un champ en plus", async () => {
    await assertFails(setDoc(meta(db("alice")), { nb: 201 }));
    await assertFails(setDoc(meta(db("alice")), { nb: -1 }));
    await assertFails(setDoc(meta(db("alice")), { nb: 1, autre: 2 }));
    await assertSucceeds(setDoc(meta(db("alice")), { nb: 0 }));
  });
  it("la collection d'un autre chemin reste fermée", async () => {
    await assertFails(
      setDoc(doc(collection(db("alice"), "users/alice/espacePartage2"), "x"), elem()),
    );
  });
});

describe("expiration (V4.27)", () => {
  const dans = (ms) => Timestamp.fromMillis(Date.now() + ms);
  it("expireLe obligatoire et borné à la création", async () => {
    const sans = elem();
    delete sans.expireLe;
    const alice = db("alice");
    const lot = writeBatch(alice);
    lot.set(el(alice, "e0"), sans);
    lot.set(meta(alice), { nb: increment(1) }, { merge: true });
    await assertFails(lot.commit()); // absent
    await assertFails(ajouter(db("alice"), "e1", { expireLe: dans(30 * 60_000) })); // trop proche
    await assertFails(ajouter(db("alice"), "e2", { expireLe: dans(32 * 86_400_000) })); // trop loin
    await assertFails(ajouter(db("alice"), "e3", { expireLe: dans(-3_600_000) })); // déjà passé
    await assertFails(ajouter(db("alice"), "e4", { expireLe: Date.now() + 86_400_000 })); // pas un timestamp
    await assertSucceeds(ajouter(db("alice"), "e5", { expireLe: dans(60 * 60_000 + 5 * 60_000) }));
    await assertSucceeds(ajouter(db("alice"), "e6", { expireLe: dans(30 * 86_400_000) }));
  });

  it("prolongation : plus tard seulement, bornée ; jamais raccourcie", async () => {
    await assertSucceeds(ajouter(db("alice"), "e1", { expireLe: dans(2 * 3_600_000) }));
    await assertSucceeds(updateDoc(el(db("alice"), "e1"), { expireLe: dans(86_400_000) }));
    await assertFails(updateDoc(el(db("alice"), "e1"), { expireLe: dans(3_600_000 + 600_000) })); // plus tôt
    await assertFails(updateDoc(el(db("alice"), "e1"), { expireLe: dans(40 * 86_400_000) })); // trop loin
  });

  it("un élément d'avant la V4.27 reçoit sa première échéance", async () => {
    const vieux = { ...elem(), creeLe: Timestamp.fromMillis(Date.now() - 90 * 86_400_000) };
    delete vieux.expireLe;
    await env.withSecurityRulesDisabled((ctx) => setDoc(el(ctx.firestore(), "vieux"), vieux));
    await assertSucceeds(updateDoc(el(db("alice"), "vieux"), { expireLe: dans(7 * 86_400_000) }));
  });

  it("la lecture ne dépend pas de l'expiration (un élément expiré reste lisible jusqu'à sa suppression)", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(el(ctx.firestore(), "x"), { ...elem(), expireLe: dans(-1000) }),
    );
    await assertSucceeds(getDoc(el(db("alice"), "x")));
  });
});
