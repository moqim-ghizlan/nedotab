import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nedotab",
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env?.cleanup());

const stockage = (uid) =>
  uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage();
const octets = (n) => new Uint8Array(n);
const MO = 1024 * 1024;

describe("users/{uid}/fonds", () => {
  it("A envoie 1 Mo de WebP dans ses fonds, le relit et le supprime", async () => {
    const r = ref(stockage("A"), "users/A/fonds/f1.webp");
    await assertSucceeds(uploadBytes(r, octets(MO), { contentType: "image/webp" }));
    await assertSucceeds(getBytes(r));
    await assertSucceeds(deleteObject(r));
  });
  it("JPEG et PNG acceptés", async () => {
    await assertSucceeds(
      uploadBytes(ref(stockage("A"), "users/A/fonds/f.jpg"), octets(10), {
        contentType: "image/jpeg",
      }),
    );
    await assertSucceeds(
      uploadBytes(ref(stockage("A"), "users/A/fonds/f.png"), octets(10), {
        contentType: "image/png",
      }),
    );
  });
  it("6 Mo refusés", async () => {
    await assertFails(
      uploadBytes(ref(stockage("A"), "users/A/fonds/gros.webp"), octets(6 * MO), {
        contentType: "image/webp",
      }),
    );
  });
  it("text/html et SVG refusés", async () => {
    await assertFails(
      uploadBytes(ref(stockage("A"), "users/A/fonds/page.html"), octets(10), {
        contentType: "text/html",
      }),
    );
    await assertFails(
      uploadBytes(ref(stockage("A"), "users/A/fonds/i.svg"), octets(10), {
        contentType: "image/svg+xml",
      }),
    );
  });
  it("dans le dossier de B : refusé", async () => {
    await assertFails(
      uploadBytes(ref(stockage("A"), "users/B/fonds/f.webp"), octets(10), {
        contentType: "image/webp",
      }),
    );
    await env.withSecurityRulesDisabled((ctx) =>
      uploadBytes(ref(ctx.storage(), "users/B/fonds/b.webp"), octets(10), {
        contentType: "image/webp",
      }),
    );
    await assertFails(getBytes(ref(stockage("A"), "users/B/fonds/b.webp")));
    await assertFails(deleteObject(ref(stockage("A"), "users/B/fonds/b.webp")));
  });
  it("non connecté : refusé", async () => {
    await assertFails(
      uploadBytes(ref(stockage(null), "users/A/fonds/f.webp"), octets(10), {
        contentType: "image/webp",
      }),
    );
  });
  it("hors du dossier des fonds : refusé", async () => {
    await assertFails(
      uploadBytes(ref(stockage("A"), "users/A/autre/f.webp"), octets(10), {
        contentType: "image/webp",
      }),
    );
    await assertFails(
      uploadBytes(ref(stockage("A"), "public/f.webp"), octets(10), { contentType: "image/webp" }),
    );
  });
});
