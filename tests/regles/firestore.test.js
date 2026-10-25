import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

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
const etat = (extra = {}) => ({
  versionSchema: 1,
  grille: [{ id: "a", type: "site", titre: "A", url: "https://a.fr" }],
  reglages: { theme: "auto" },
  majLe: serverTimestamp(),
  majPar: "appareil-1",
  ...extra,
});
const sauvegarde = (extra = {}) => ({
  creeLe: serverTimestamp(),
  type: "manuelle",
  nom: "Avant rangement",
  appareil: "extension",
  versionSchema: 1,
  nbSites: 1,
  nbDossiers: 0,
  grille: [],
  reglages: {},
  ...extra,
});
/** Writes as an admin, bypassing the rules (setting up a test). */
const preparer = (chemin, donnees) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), chemin), donnees));

describe("users/{uid}", () => {
  it("A écrit puis lit son propre document", async () => {
    await assertSucceeds(setDoc(doc(db("A"), "users/A"), etat()));
    await assertSucceeds(getDoc(doc(db("A"), "users/A")));
  });
  it("A ne lit pas et n'écrit pas le document de B", async () => {
    await preparer("users/B", { versionSchema: 1 });
    await assertFails(getDoc(doc(db("A"), "users/B")));
    await assertFails(setDoc(doc(db("A"), "users/B"), etat()));
    await assertFails(deleteDoc(doc(db("A"), "users/B")));
  });
  it("non connecté : refusé partout", async () => {
    await assertFails(getDoc(doc(db(null), "users/A")));
    await assertFails(setDoc(doc(db(null), "users/A"), etat()));
  });
  it("A supprime son document", async () => {
    await preparer("users/A", { versionSchema: 1 });
    await assertSucceeds(deleteDoc(doc(db("A"), "users/A")));
  });
  it("champ inconnu refusé", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ admin: true })));
  });
  it("versionSchema en chaîne refusé", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ versionSchema: "1" })));
  });
  it("versionSchema hors bornes refusé", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ versionSchema: 0 })));
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ versionSchema: 11 })));
  });
  it("majLe différent de l'heure serveur refusé", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ majLe: Timestamp.fromMillis(0) })));
  });
  it("grille de 1 001 éléments refusée, 1 000 acceptée", async () => {
    const element = { id: "x", type: "site" };
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ grille: Array(1001).fill(element) })));
    await assertSucceeds(
      setDoc(doc(db("A"), "users/A"), etat({ grille: Array(1000).fill(element) })),
    );
  });
  it("grille qui n'est pas une liste refusée, majPar trop long refusé", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ grille: {} })));
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ majPar: "x".repeat(65) })));
  });
  it("revision entière acceptée, revision en texte refusée", async () => {
    await assertSucceeds(setDoc(doc(db("A"), "users/A"), etat({ revision: 3 })));
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ revision: "3" })));
  });
  it("V2.9 : une écriture doit dépasser la révision en ligne", async () => {
    await assertSucceeds(setDoc(doc(db("A"), "users/A"), etat({ revision: 3 })));
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ revision: 3 })));
    await assertFails(setDoc(doc(db("A"), "users/A"), etat({ revision: 2 })));
    await assertFails(setDoc(doc(db("A"), "users/A"), etat()));
    await assertSucceeds(setDoc(doc(db("A"), "users/A"), etat({ revision: 4 })));
  });
  it("document d'avant les révisions : la première révision est acceptée", async () => {
    await assertSucceeds(setDoc(doc(db("A"), "users/A"), etat()));
    await assertSucceeds(setDoc(doc(db("A"), "users/A"), etat({ revision: 1 })));
  });
});

describe("users/{uid}/sauvegardes", () => {
  it("création valide acceptée et relue", async () => {
    await assertSucceeds(setDoc(doc(db("A"), "users/A/sauvegardes/s1"), sauvegarde()));
    await assertSucceeds(getDoc(doc(db("A"), "users/A/sauvegardes/s1")));
  });
  it("nom de 200 caractères refusé, nom vide refusé, sans nom accepté", async () => {
    await assertFails(
      setDoc(doc(db("A"), "users/A/sauvegardes/s1"), sauvegarde({ nom: "x".repeat(200) })),
    );
    await assertFails(setDoc(doc(db("A"), "users/A/sauvegardes/s2"), sauvegarde({ nom: "" })));
    await assertSucceeds(
      setDoc(doc(db("A"), "users/A/sauvegardes/s3"), sauvegarde({ nom: null, type: "auto" })),
    );
  });
  it("appareils de l'application web acceptés (V3.3)", async () => {
    for (const appareil of ["pwa", "iphone", "ipad", "navigateur"])
      await assertSucceeds(
        setDoc(doc(db("A"), `users/A/sauvegardes/${appareil}`), sauvegarde({ appareil })),
      );
  });
  it("appareil inconnu ou compteurs non entiers refusés", async () => {
    await assertFails(
      setDoc(doc(db("A"), "users/A/sauvegardes/s1"), sauvegarde({ appareil: "pirate" })),
    );
    await assertFails(setDoc(doc(db("A"), "users/A/sauvegardes/s2"), sauvegarde({ nbSites: "1" })));
  });
  it("type inconnu refusé", async () => {
    await assertFails(
      setDoc(doc(db("A"), "users/A/sauvegardes/s1"), sauvegarde({ type: "pirate" })),
    );
  });
  it("champ inconnu refusé, date fournie par le client refusée", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A/sauvegardes/s1"), sauvegarde({ x: 1 })));
    await assertFails(
      setDoc(
        doc(db("A"), "users/A/sauvegardes/s1"),
        sauvegarde({ creeLe: Timestamp.fromMillis(0) }),
      ),
    );
  });
  it("une sauvegarde ne se modifie jamais", async () => {
    await preparer("users/A/sauvegardes/s1", { type: "manuelle" });
    await assertFails(setDoc(doc(db("A"), "users/A/sauvegardes/s1"), sauvegarde()));
  });
  it("A supprime ses sauvegardes", async () => {
    await preparer("users/A/sauvegardes/s1", { type: "manuelle" });
    await assertSucceeds(deleteDoc(doc(db("A"), "users/A/sauvegardes/s1")));
  });
  it("les sauvegardes de B sont inaccessibles à A", async () => {
    await preparer("users/B/sauvegardes/s1", { type: "manuelle" });
    await assertFails(getDoc(doc(db("A"), "users/B/sauvegardes/s1")));
    await assertFails(setDoc(doc(db("A"), "users/B/sauvegardes/s2"), sauvegarde()));
    await assertFails(deleteDoc(doc(db("A"), "users/B/sauvegardes/s1")));
  });
});

describe("chemins fermés", () => {
  it("users/A/prive/ia : refusé même pour A", async () => {
    await preparer("users/A/prive/ia", { cle: "chiffrée" });
    await assertFails(getDoc(doc(db("A"), "users/A/prive/ia")));
    await assertFails(setDoc(doc(db("A"), "users/A/prive/ia"), { cle: "x" }));
  });
  it("sous-collection non prévue : refusée", async () => {
    await assertFails(setDoc(doc(db("A"), "users/A/autre/x"), { a: 1 }));
    await assertFails(getDoc(doc(db("A"), "users/A/autre/x")));
  });
  it("config : lecture connecté seulement, jamais d'écriture", async () => {
    await preparer("config/modeles", { liste: [] });
    await assertSucceeds(getDoc(doc(db("A"), "config/modeles")));
    await assertFails(getDoc(doc(db(null), "config/modeles")));
    await assertFails(setDoc(doc(db("A"), "config/modeles"), { liste: ["x"] }));
  });
  it("collection racine inconnue : refusée", async () => {
    await assertFails(setDoc(doc(db("A"), "public/x"), { a: 1 }));
  });
});
