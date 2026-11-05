import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, listAll, ref, updateMetadata, uploadBytes } from "firebase/storage";
import {
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Images des todos (V6.4) : règles Storage et règles Firestore.
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

const ctx = (uid, verifie = true) =>
  uid
    ? env.authenticatedContext(uid, { email_verified: verifie })
    : env.unauthenticatedContext();
const stockage = (uid) => ctx(uid).storage();
const db = (uid) => ctx(uid).firestore();
const MO = 1024 * 1024;
const octets = (n) => new Uint8Array(n);
const ID = "a".repeat(32);
const ID2 = "b".repeat(32);

describe("Storage todos/{uid}/{todoId}/{nom}", () => {
  it("le propriétaire envoie une image, sa miniature, les relit, les liste et les supprime", async () => {
    const r = ref(stockage("alice"), `todos/alice/t1/${ID}.webp`);
    await assertSucceeds(uploadBytes(r, octets(MO), { contentType: "image/webp" }));
    await assertSucceeds(
      uploadBytes(ref(stockage("alice"), `todos/alice/t1/${ID}_mini.webp`), octets(100), {
        contentType: "image/webp",
      }),
    );
    await assertSucceeds(getBytes(r));
    await assertSucceeds(listAll(ref(stockage("alice"), "todos/alice")));
    await assertSucceeds(deleteObject(r));
  });
  it("JPEG et PNG acceptés avec leurs extensions", async () => {
    await assertSucceeds(
      uploadBytes(ref(stockage("alice"), `todos/alice/t1/${ID}.jpg`), octets(10), { contentType: "image/jpeg" }),
    );
    await assertSucceeds(
      uploadBytes(ref(stockage("alice"), `todos/alice/t1/${ID2}.png`), octets(10), { contentType: "image/png" }),
    );
  });
  it("autre utilisateur et anonyme : ni lecture, ni écriture, ni liste", async () => {
    await env.withSecurityRulesDisabled((c) =>
      uploadBytes(ref(c.storage(), `todos/alice/t1/${ID}.webp`), octets(10), { contentType: "image/webp" }),
    );
    await assertFails(getBytes(ref(stockage("bob"), `todos/alice/t1/${ID}.webp`)));
    await assertFails(getBytes(ref(stockage(null), `todos/alice/t1/${ID}.webp`)));
    await assertFails(
      uploadBytes(ref(stockage("bob"), `todos/alice/t1/${ID2}.webp`), octets(10), { contentType: "image/webp" }),
    );
    await assertFails(listAll(ref(stockage("bob"), "todos/alice")));
    await assertFails(deleteObject(ref(stockage("bob"), `todos/alice/t1/${ID}.webp`)));
  });
  it("plus de 5 Mo refusé, 5 Mo acceptés", async () => {
    await assertFails(
      uploadBytes(ref(stockage("alice"), `todos/alice/t1/${ID}.webp`), octets(5 * MO + 1), { contentType: "image/webp" }),
    );
    await assertSucceeds(
      uploadBytes(ref(stockage("alice"), `todos/alice/t1/${ID2}.webp`), octets(5 * MO), { contentType: "image/webp" }),
    );
  });
  it("type non image, SVG, GIF, HTML refusés", async () => {
    for (const type of ["text/html", "image/svg+xml", "image/gif", "application/pdf", "application/x-msdownload"]) {
      await assertFails(
        uploadBytes(ref(stockage("alice"), `todos/alice/t1/${ID}.webp`), octets(10), { contentType: type }),
      );
    }
  });
  it("nom non généré refusé (nom d'origine, double extension, séquence ..)", async () => {
    for (const nom of ["photo.jpg", "vacances.webp", `${ID}.exe`, `${ID}.svg`, "..%2Fx.webp", `${ID}.webp.html`]) {
      await assertFails(
        uploadBytes(ref(stockage("alice"), `todos/alice/t1/${nom}`), octets(10), { contentType: "image/webp" }),
      );
    }
  });
  it("les métadonnées d'une image ne se modifient pas", async () => {
    // (Le remplacement d'un fichier par un autre au même nom n'est pas distingué d'une création
    // par l'émulateur Storage : la règle `update: false` s'applique en production.)
    const r = ref(stockage("alice"), `todos/alice/t1/${ID}.webp`);
    await uploadBytes(r, octets(10), { contentType: "image/webp" });
    await assertFails(updateMetadata(r, { contentType: "text/html" }));
  });
});

describe("Firestore : champ images du todo", () => {
  // One connection per test: a document reference belongs to the instance that made it.
  let dA;
  let dB;
  beforeEach(() => {
    dA = db("alice");
    dB = db("alice");
  });
  const sujet = () =>
    env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "users/alice/sujets/s1"), { nom: "S", ordre: 1 }));
  const meta = (d) => doc(d, "users/alice/todosMeta/usage");
  const tod = (d) => doc(d, "users/alice/todos/t1");
  const img = (extra = {}) => ({
    id: ID,
    chemin: `todos/alice/t1/${ID}.webp`,
    note: "une note",
    taille: 1000,
    typeMime: "image/webp",
    largeur: 800,
    hauteur: 600,
    ordre: 1000,
    ...extra,
  });
  const creer = async (images = []) => {
    await sujet();
    const d = dA;
    const lot = writeBatch(d);
    lot.set(tod(d), {
      v: 1, sujetId: "s1", titre: "t", description: "", echeance: null, fait: false, faitLe: null,
      ordre: 1000, images, creeLe: serverTimestamp(), modifieLe: serverTimestamp(),
    });
    lot.set(meta(d), { nbTodos: increment(1) }, { merge: true });
    return lot.commit();
  };
  const ajouter = (images) =>
    runTransaction(dA, async (tx) => {
      await tx.get(tod(dA));
      tx.update(tod(dA), { images, modifieLe: serverTimestamp() });
      tx.set(meta(dA), { octets: increment(1000) }, { merge: true });
    });

  it("accepte une image bien formée (transaction todo + octets)", async () => {
    await creer();
    await assertSucceeds(ajouter([img()]));
  });
  it("accepte 10 images, refuse la 11e", async () => {
    await creer();
    const ids = Array.from({ length: 10 }, (_, i) => i.toString(16).padStart(32, "c"));
    const dix = ids.map((id, i) => img({ id, chemin: `todos/alice/t1/${id}.webp`, ordre: i }));
    await assertSucceeds(updateDoc(tod(dA), { images: dix, modifieLe: serverTimestamp() }));
    await assertFails(
      updateDoc(tod(dA), { images: [...dix, img({ id: ID2 })], modifieLe: serverTimestamp() }),
    );
  });
  it("refuse une image mal formée", async () => {
    await creer();
    const essai = (extra) =>
      updateDoc(tod(dA), { images: [img(extra)], modifieLe: serverTimestamp() });
    await assertFails(essai({ chemin: `todos/bob/t1/${ID}.webp` })); // dossier d'un autre compte
    await assertFails(essai({ chemin: "https://exemple.fr/p.webp" })); // une adresse, jamais
    await assertFails(essai({ chemin: `todos/alice/t1/photo.webp` }));
    await assertFails(essai({ typeMime: "image/svg+xml" }));
    await assertFails(essai({ taille: 5 * MO + 1 }));
    await assertFails(essai({ taille: 0 }));
    await assertFails(essai({ note: "x".repeat(301) }));
    await assertFails(essai({ pirate: true }));
    await assertFails(essai({ id: "pas-un-id" }));
  });
  it("octets : au-delà de 200 Mo refusé", async () => {
    await creer();
    await assertSucceeds(setDoc(meta(dA), { octets: 200 * MO }));
    await assertFails(setDoc(meta(dA), { octets: 200 * MO + 1 }));
  });
  it("concurrence : deux appareils ajoutent une image, les deux restent", async () => {
    await creer();
    const ajoutOk = (d, id) =>
      runTransaction(d, async (tx) => {
        const s = await tx.get(tod(d));
        const liste = s.data().images ?? [];
        tx.update(tod(d), {
          images: [...liste, img({ id, chemin: `todos/alice/t1/${id}.webp`, ordre: liste.length })],
          modifieLe: serverTimestamp(),
        });
        tx.set(meta(d), { octets: increment(1000) }, { merge: true });
      });
    await Promise.all([ajoutOk(dA, ID), ajoutOk(dB, ID2)]);
    const lu = (await getDoc(tod(dA))).data();
    if (lu.images.length !== 2) throw new Error(`2 images attendues, ${lu.images.length} trouvées`);
  });
});
