import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, increment, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { deleteObject, getBytes, listAll, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Fichiers du partage (V4.25) : règles Storage et Firestore contre les émulateurs.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(() => env?.cleanup());

const MO = 1024 * 1024;
const ctx = (uid, verifie = true) => env.authenticatedContext(uid, { email_verified: verifie });
const stockage = (uid, verifie) => (uid ? ctx(uid, verifie).storage() : env.unauthenticatedContext().storage());
const octets = (n) => new Uint8Array(n);
const envoyer = (uid, chemin, taille, type) =>
  uploadBytes(ref(stockage(uid), chemin), octets(taille), { contentType: type });

describe("Storage : partages/{uid}/{id}/{nom}", () => {
  it("le propriétaire envoie 1 Mo, le relit et le supprime", async () => {
    const r = ref(stockage("A"), "partages/A/id1/photo.heic");
    await assertSucceeds(uploadBytes(r, octets(MO), { contentType: "image/heic" }));
    await assertSucceeds(getBytes(r));
    await assertSucceeds(deleteObject(r));
  });
  it("25 Mo acceptés, 25 Mo + 1 refusés, fichier vide refusé", async () => {
    await assertSucceeds(envoyer("A", "partages/A/i1/a.pdf", 25 * MO, "application/pdf"));
    await assertFails(envoyer("A", "partages/A/i2/b.pdf", 25 * MO + 1, "application/pdf"));
    await assertFails(envoyer("A", "partages/A/i3/c.pdf", 0, "application/pdf"));
  });
  it("types exécutables refusés (par type et par extension)", async () => {
    await assertFails(envoyer("A", "partages/A/i1/setup.exe", 10, "application/octet-stream"));
    await assertFails(envoyer("A", "partages/A/i2/SETUP.EXE", 10, "application/octet-stream"));
    await assertFails(envoyer("A", "partages/A/i3/x.png", 10, "application/x-msdownload"));
    await assertFails(envoyer("A", "partages/A/i4/run.sh", 10, "text/plain"));
    await assertFails(envoyer("A", "partages/A/i5/a.js", 10, "text/plain"));
    await assertFails(envoyer("A", "partages/A/i6/a.png", 10, "application/javascript"));
  });
  it("SVG, HTML et zip sont acceptés comme fichiers (jamais affichés)", async () => {
    await assertSucceeds(envoyer("A", "partages/A/i1/a.svg", 10, "image/svg+xml"));
    await assertSucceeds(envoyer("A", "partages/A/i2/a.html", 10, "text/html"));
    await assertSucceeds(envoyer("A", "partages/A/i3/a.zip", 10, "application/zip"));
  });
  it("un autre utilisateur ou un visiteur : lecture, écriture, liste et suppression refusées", async () => {
    await assertSucceeds(envoyer("A", "partages/A/i1/a.pdf", 10, "application/pdf"));
    for (const uid of ["B", null]) {
      await assertFails(getBytes(ref(stockage(uid), "partages/A/i1/a.pdf")));
      await assertFails(envoyer(uid, "partages/A/i2/b.pdf", 10, "application/pdf"));
      await assertFails(listAll(ref(stockage(uid), "partages/A")));
      await assertFails(deleteObject(ref(stockage(uid), "partages/A/i1/a.pdf")));
    }
    await assertSucceeds(listAll(ref(stockage("A"), "partages/A")));
    await assertSucceeds(listAll(ref(stockage("A"), "partages/A/i1")));
  });
  it("chemin hors de partages/{uid}/ refusé", async () => {
    await assertFails(envoyer("A", "partages/B/i1/a.pdf", 10, "application/pdf"));
    await assertFails(envoyer("A", "autre/A/i1/a.pdf", 10, "application/pdf"));
    await assertFails(envoyer("A", "partages/A/a.pdf", 10, "application/pdf"));
  });
  it("compte non vérifié : aucun accès", async () => {
    await assertFails(
      uploadBytes(ref(stockage("A", false), "partages/A/i1/a.pdf"), octets(10), { contentType: "application/pdf" }),
    );
  });
});

describe("Firestore : élément de type fichier et compteur d'octets", () => {
  const db = (uid = "alice") => ctx(uid).firestore();
  const elem = (uid, taille, extra = {}) => ({
    type: "fichier",
    contenu: "rapport.pdf",
    titre: "rapport.pdf",
    appareil: "extension",
    epingle: false,
    creeLe: serverTimestamp(),
    taille,
    typeMime: "application/pdf",
    chemin: `partages/${uid}/id1/rapport.pdf`,
    ...extra,
  });
  const meta = (d) => doc(d, "users/alice/espacePartageMeta/usage");
  const ajouter = (d, id, taille, incr = taille, extra = {}) => {
    const lot = writeBatch(d);
    lot.set(doc(d, `users/alice/espacePartage/${id}`), elem("alice", taille, extra));
    lot.set(meta(d), { nb: increment(1), octets: increment(incr) }, { merge: true });
    return lot.commit();
  };

  it("un fichier de 3 Mo avec octets +3 Mo passe", async () => {
    await assertSucceeds(ajouter(db(), "f1", 3 * MO));
  });
  it("le compteur d'octets doit augmenter exactement de la taille", async () => {
    await assertFails(ajouter(db(), "f1", 3 * MO, 2 * MO));
    await assertFails(ajouter(db(), "f2", 3 * MO, 0));
  });
  it("200 Mo dépassés de 1 octet : refusé", async () => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(meta(c.firestore()), { nb: 1, octets: 200 * MO - 10 }),
    );
    await assertFails(ajouter(db(), "f1", 11));
    await assertSucceeds(ajouter(db(), "f2", 10));
  });
  it("taille nulle, énorme ou chemin d'un autre utilisateur : refusés", async () => {
    await assertFails(ajouter(db(), "f1", 0));
    await assertFails(ajouter(db(), "f2", 26 * MO));
    await assertFails(ajouter(db(), "f3", 10, 10, { chemin: "partages/bob/id1/x.pdf" }));
    await assertFails(ajouter(db(), "f4", 10, 10, { chemin: "users/alice/fonds/x.webp" }));
  });
  it("un texte ne peut pas porter de champs de fichier", async () => {
    const d = db();
    const lot = writeBatch(d);
    lot.set(doc(d, "users/alice/espacePartage/t1"), {
      type: "texte",
      contenu: "a",
      titre: "a",
      appareil: "extension",
      epingle: false,
      creeLe: serverTimestamp(),
      taille: 5,
    });
    await assertFails(lot.commit());
  });
});
