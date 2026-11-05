import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Sujets et todos (V6.0) contre l'émulateur Firestore.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

const db = (uid, verifie = true) =>
  uid
    ? env.authenticatedContext(uid, { email_verified: verifie }).firestore()
    : env.unauthenticatedContext().firestore();
const meta = (d, uid = "alice") => doc(d, `users/${uid}/todosMeta/usage`);
const suj = (d, id, uid = "alice") => doc(d, `users/${uid}/sujets/${id}`);
const tod = (d, id, uid = "alice") => doc(d, `users/${uid}/todos/${id}`);

const sujet = (extra = {}) => ({
  nom: "Courses",
  ordre: 1000,
  couleur: null,
  creeLe: serverTimestamp(),
  modifieLe: serverTimestamp(),
  ...extra,
});
const todo = (extra = {}) => ({
  v: 1,
  sujetId: "s1",
  titre: "Du pain",
  description: "",
  echeance: null,
  fait: false,
  faitLe: null,
  ordre: 1000,
  images: [],
  creeLe: serverTimestamp(),
  modifieLe: serverTimestamp(),
  ...extra,
});

/** Les lots de l'application : le document ET le compteur. */
const ajouterSujet = (d, id, extra = {}) => {
  const lot = writeBatch(d);
  lot.set(suj(d, id), sujet(extra));
  lot.set(meta(d), { nbSujets: increment(1) }, { merge: true });
  return lot.commit();
};
const ajouterTodo = (d, id, extra = {}) => {
  const lot = writeBatch(d);
  lot.set(tod(d, id), todo(extra));
  lot.set(meta(d), { nbTodos: increment(1) }, { merge: true });
  return lot.commit();
};
const remplirCompteur = (champs) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(meta(ctx.firestore()), champs));
const sujetSansRegles = (id) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(suj(ctx.firestore(), id), { nom: "S", ordre: 1 }));

describe("sujets", () => {
  it("le propriétaire crée (sujet + compteur), lit, renomme et supprime", async () => {
    await assertSucceeds(ajouterSujet(db("alice"), "s1"));
    await assertSucceeds(getDoc(suj(db("alice"), "s1")));
    await assertSucceeds(
      updateDoc(suj(db("alice"), "s1"), { nom: "Autre", modifieLe: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(suj(db("alice"), "s1"), { couleur: "mer", modifieLe: serverTimestamp() }),
    );
    const d = db("alice");
    const lot = writeBatch(d);
    lot.delete(suj(d, "s1"));
    lot.set(meta(d), { nbSujets: increment(-1) }, { merge: true });
    await assertSucceeds(lot.commit());
  });
  it("personne d'autre ne lit ni n'écrit ; anonyme et e-mail non vérifié refusés", async () => {
    await ajouterSujet(db("alice"), "s1");
    await assertFails(getDoc(suj(db("bob"), "s1", "alice")));
    await assertFails(setDoc(suj(db("bob"), "s2", "alice"), sujet()));
    await assertFails(getDoc(suj(db(null), "s1", "alice")));
    await assertFails(ajouterSujet(db("alice", false), "s2"));
  });
  it("refuse un champ inconnu, un nom vide ou trop long, une couleur hors liste", async () => {
    await assertFails(ajouterSujet(db("alice"), "s1", { pirate: 1 }));
    await assertFails(ajouterSujet(db("alice"), "s1", { nom: "" }));
    await assertFails(ajouterSujet(db("alice"), "s1", { nom: "x".repeat(61) }));
    await assertFails(ajouterSujet(db("alice"), "s1", { couleur: "fluo" }));
  });
  it("refuse un creeLe falsifié, et un creeLe modifié à la mise à jour", async () => {
    await assertFails(ajouterSujet(db("alice"), "s1", { creeLe: Timestamp.fromMillis(5) }));
    await ajouterSujet(db("alice"), "s1");
    await assertFails(
      updateDoc(suj(db("alice"), "s1"), {
        creeLe: Timestamp.fromMillis(5),
        modifieLe: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(suj(db("alice"), "s1"), { nom: "sans date" }));
  });
  it("refuse le 31e sujet", async () => {
    await remplirCompteur({ nbSujets: 30 });
    await assertFails(ajouterSujet(db("alice"), "s31"));
    await remplirCompteur({ nbSujets: 29 });
    await assertSucceeds(ajouterSujet(db("alice"), "s30"));
  });
  it("refuse une création sans compteur ou avec un compteur incohérent", async () => {
    const d = db("alice");
    await assertFails(setDoc(suj(d, "s1"), sujet()));
    const lot = writeBatch(d);
    lot.set(suj(d, "s2"), sujet());
    lot.set(meta(d), { nbSujets: increment(2) }, { merge: true });
    await assertFails(lot.commit());
  });
});

describe("todos", () => {
  beforeEach(() => sujetSansRegles("s1"));

  it("le propriétaire crée, lit, modifie partiellement et supprime", async () => {
    await assertSucceeds(ajouterTodo(db("alice"), "t1"));
    await assertSucceeds(getDoc(tod(db("alice"), "t1")));
    await assertSucceeds(
      updateDoc(tod(db("alice"), "t1"), { titre: "Du lait", modifieLe: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(tod(db("alice"), "t1"), {
        fait: true,
        faitLe: serverTimestamp(),
        modifieLe: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(tod(db("alice"), "t1"), { echeance: "2026-12-31", modifieLe: serverTimestamp() }),
    );
    const d = db("alice");
    const lot = writeBatch(d);
    lot.delete(tod(d, "t1"));
    lot.set(meta(d), { nbTodos: increment(-1) }, { merge: true });
    await assertSucceeds(lot.commit());
  });
  it("un titre vide est un brouillon valide", async () => {
    await assertSucceeds(ajouterTodo(db("alice"), "t1", { titre: "" }));
  });
  it("un autre utilisateur ne lit ni n'écrit rien", async () => {
    await ajouterTodo(db("alice"), "t1");
    await assertFails(getDoc(tod(db("bob"), "t1", "alice")));
    await assertFails(
      updateDoc(tod(db("bob"), "t1", "alice"), { titre: "pirate", modifieLe: serverTimestamp() }),
    );
    await assertFails(ajouterTodo(db("alice", false), "t2"));
  });
  it("refuse champ inconnu, titre/description trop longs, échéance invalide, 11 images", async () => {
    await assertFails(ajouterTodo(db("alice"), "t1", { pirate: 1 }));
    await assertFails(ajouterTodo(db("alice"), "t1", { titre: "x".repeat(201) }));
    await assertFails(ajouterTodo(db("alice"), "t1", { description: "x".repeat(20001) }));
    await assertSucceeds(ajouterTodo(db("alice"), "t0", { description: "x".repeat(20000) }));
    await assertFails(ajouterTodo(db("alice"), "t1", { echeance: "demain" }));
    await assertFails(ajouterTodo(db("alice"), "t1", { echeance: "2026-13-40" }));
    await assertFails(ajouterTodo(db("alice"), "t1", { images: new Array(11).fill({}) }));
    await assertFails(ajouterTodo(db("alice"), "t1", { fait: true, faitLe: null }));
  });
  it("refuse un creeLe falsifié ou modifié", async () => {
    await assertFails(ajouterTodo(db("alice"), "t1", { creeLe: Timestamp.fromMillis(5) }));
    await ajouterTodo(db("alice"), "t1");
    await assertFails(
      updateDoc(tod(db("alice"), "t1"), {
        creeLe: serverTimestamp(),
        modifieLe: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(tod(db("alice"), "t1"), { titre: "sans modifieLe" }));
  });
  it("refuse un todo vers un sujet inexistant (création et déplacement)", async () => {
    await assertFails(ajouterTodo(db("alice"), "t1", { sujetId: "fantome" }));
    await ajouterTodo(db("alice"), "t2");
    await assertFails(
      updateDoc(tod(db("alice"), "t2"), { sujetId: "fantome", modifieLe: serverTimestamp() }),
    );
    await sujetSansRegles("s2");
    await assertSucceeds(
      updateDoc(tod(db("alice"), "t2"), { sujetId: "s2", modifieLe: serverTimestamp() }),
    );
  });
  it("refuse un sujetId vers le sujet d'un autre compte", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(suj(ctx.firestore(), "sb", "bob"), { nom: "B", ordre: 1 }),
    );
    await assertFails(ajouterTodo(db("alice"), "t1", { sujetId: "sb" }));
  });
  it("refuse le 501e todo", async () => {
    await remplirCompteur({ nbTodos: 500 });
    await assertFails(ajouterTodo(db("alice"), "t501"));
    await remplirCompteur({ nbTodos: 499 });
    await assertSucceeds(ajouterTodo(db("alice"), "t500"));
  });
  it("refuse un compteur incohérent", async () => {
    const d = db("alice");
    await assertFails(setDoc(tod(d, "t1"), todo()));
    const lot = writeBatch(d);
    lot.set(tod(d, "t2"), todo());
    lot.set(meta(d), { nbTodos: increment(5) }, { merge: true });
    await assertFails(lot.commit());
  });
  it("deux créations simultanées au 500e : une seule passe", async () => {
    await remplirCompteur({ nbTodos: 499 });
    const a = ajouterTodo(db("alice"), "ta");
    const b = ajouterTodo(db("alice"), "tb");
    const r = await Promise.allSettled([a, b]);
    const ok = r.filter((x) => x.status === "fulfilled").length;
    if (ok !== 1) throw new Error(`une seule création attendue, ${ok} réussies`);
  });
});

describe("compteurs du sujet (V6.1)", () => {
  it("un sujet naît avec des compteurs à zéro, jamais autre chose", async () => {
    await assertSucceeds(ajouterSujet(db("alice"), "s1", { nbRestants: 0, nbTotal: 0 }));
    await assertFails(ajouterSujet(db("alice"), "s2", { nbRestants: 3, nbTotal: 3 }));
  });
  it("le lot de création d'un todo fait bouger les deux compteurs du sujet", async () => {
    await ajouterSujet(db("alice"), "s1", { nbRestants: 0, nbTotal: 0 });
    const d = db("alice");
    const lot = writeBatch(d);
    lot.set(tod(d, "t1"), todo());
    lot.set(meta(d), { nbTodos: increment(1) }, { merge: true });
    lot.update(suj(d, "s1"), { nbTotal: increment(1), nbRestants: increment(1) });
    await assertSucceeds(lot.commit());
    const lu = (await getDoc(suj(db("alice"), "s1"))).data();
    if (lu.nbTotal !== 1 || lu.nbRestants !== 1) throw new Error("compteurs du sujet faux");
  });
  it("refuse un compteur négatif, non entier ou hors borne", async () => {
    await ajouterSujet(db("alice"), "s1", { nbRestants: 0, nbTotal: 0 });
    const ref = suj(db("alice"), "s1");
    await assertFails(updateDoc(ref, { nbRestants: -1 }));
    await assertFails(updateDoc(ref, { nbTotal: 1.5 }));
    await assertFails(updateDoc(ref, { nbTotal: 501 }));
    await assertSucceeds(updateDoc(ref, { nbTotal: 12, nbRestants: 7 }));
  });
  it("ne laisse pas glisser un autre champ avec les compteurs", async () => {
    await ajouterSujet(db("alice"), "s1", { nbRestants: 0, nbTotal: 0 });
    await assertFails(updateDoc(suj(db("alice"), "s1"), { nbTotal: 1, nom: "autre" }));
    await assertFails(updateDoc(suj(db("bob"), "s1", "alice"), { nbTotal: 1 }));
  });
});

describe("todosMeta", () => {
  it("n'accepte que des entiers dans les bornes", async () => {
    await assertSucceeds(setDoc(meta(db("alice")), { nbSujets: 3, nbTodos: 10, octets: 0 }));
    await assertFails(setDoc(meta(db("alice")), { nbTodos: 501 }));
    await assertFails(setDoc(meta(db("alice")), { nbSujets: 31 }));
    await assertFails(setDoc(meta(db("alice")), { nbTodos: -1 }));
    await assertFails(setDoc(meta(db("alice")), { nbTodos: 1, secret: 1 }));
    await assertFails(setDoc(meta(db("bob"), "alice"), { nbTodos: 1 }));
  });
});
