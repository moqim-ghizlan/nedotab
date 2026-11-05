import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Todos hors ligne (V6.7) contre l'émulateur Firestore : écritures mises en file puis rejouées.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

const db = () => env.authenticatedContext("alice", { email_verified: true }).firestore();
const meta = (d) => doc(d, "users/alice/todosMeta/usage");
const suj = (d, id) => doc(d, `users/alice/sujets/${id}`);
const tod = (d, id) => doc(d, `users/alice/todos/${id}`);
const todo = (extra = {}) => ({
  v: 1, sujetId: "s1", titre: "t", description: "", echeance: null, fait: false, faitLe: null,
  ordre: 1000, images: [], creeLe: serverTimestamp(), modifieLe: serverTimestamp(), ...extra,
});
const sujetExistant = () =>
  env.withSecurityRulesDisabled((c) =>
    setDoc(suj(c.firestore(), "s1"), { nom: "S", ordre: 1, nbRestants: 0, nbTotal: 0 }),
  );

describe("écritures hors ligne", () => {
  it("20 modifications faites hors ligne sont rejouées une fois, dans l'ordre", async () => {
    await sujetExistant();
    const d = db();
    const lot = writeBatch(d);
    lot.set(tod(d, "t1"), todo());
    lot.set(meta(d), { nbTodos: increment(1) }, { merge: true });
    await lot.commit();
    await disableNetwork(d);
    const envois = [];
    for (let i = 1; i <= 20; i++)
      envois.push(updateDoc(tod(d, "t1"), { titre: `version ${i}`, modifieLe: serverTimestamp() }));
    // Hors ligne, le cache local montre déjà la dernière version.
    expect((await getDoc(tod(d, "t1"))).data().titre).toBe("version 20");
    await enableNetwork(d);
    await Promise.all(envois);
    const serveur = await env.withSecurityRulesDisabled((c) => getDoc(tod(c.firestore(), "t1")));
    expect(serveur.data().titre).toBe("version 20");
  });

  it("deux appareils : champs différents, tout reste (fusion champ par champ)", async () => {
    await sujetExistant();
    const a = db();
    const lot = writeBatch(a);
    lot.set(tod(a, "t1"), todo());
    lot.set(meta(a), { nbTodos: increment(1) }, { merge: true });
    await lot.commit();
    const b = env.authenticatedContext("alice", { email_verified: true }).firestore();
    await Promise.all([
      updateDoc(tod(a, "t1"), { titre: "titre de A", modifieLe: serverTimestamp() }),
      updateDoc(tod(b, "t1"), { description: "description de B", modifieLe: serverTimestamp() }),
    ]);
    const lu = (await env.withSecurityRulesDisabled((c) => getDoc(tod(c.firestore(), "t1")))).data();
    expect(lu.titre).toBe("titre de A");
    expect(lu.description).toBe("description de B");
  });

  it("une création faite hors ligne, refusée au retour (compteur changé entre-temps), échoue proprement", async () => {
    await sujetExistant();
    const d = db();
    await disableNetwork(d);
    const lot = writeBatch(d);
    lot.set(tod(d, "tard"), todo());
    lot.set(meta(d), { nbTodos: increment(1) }, { merge: true });
    const envoi = lot.commit();
    // Pendant ce temps, un autre appareil a rempli le compteur.
    await env.withSecurityRulesDisabled((c) => setDoc(meta(c.firestore()), { nbTodos: 500 }));
    await enableNetwork(d);
    await assertFails(envoi);
    const serveur = await env.withSecurityRulesDisabled((c) => getDoc(tod(c.firestore(), "tard")));
    expect(serveur.exists()).toBe(false);
  });

  it("modifier un todo supprimé ailleurs : not-found", async () => {
    await sujetExistant();
    await expect(updateDoc(tod(db(), "fantome"), { titre: "x", modifieLe: serverTimestamp() })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("créer un todo dans un sujet supprimé ailleurs : refusé, rien n'est écrit", async () => {
    const d = db();
    const lot = writeBatch(d);
    lot.set(tod(d, "orphelin"), todo({ sujetId: "disparu" }));
    lot.set(meta(d), { nbTodos: increment(1) }, { merge: true });
    await assertFails(lot.commit());
  });
});
