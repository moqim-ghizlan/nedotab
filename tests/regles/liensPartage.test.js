import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// V4.28: un client authentifié ne peut NI lire NI écrire liensPartage, signalements,
// limitesPartage, config/partage, ni liens/** dans Storage (les fonctions seules, via Admin SDK).
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

const ctx = (uid) => env.authenticatedContext(uid, { email_verified: true });

describe("collections réservées aux fonctions", () => {
  it.each([
    "liensPartage/jeton",
    "liensPartage/jeton/contenu/copie",
    "signalements/s1",
    "limitesPartage/h1",
    "config/partage",
    "config/nettoyageEspacePartage",
  ])("%s : lecture et écriture refusées, même au propriétaire du lien", async (chemin) => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), chemin), { uid: "alice", x: 1 }),
    );
    const d = ctx("alice").firestore();
    await assertFails(getDoc(doc(d, chemin)));
    await assertFails(setDoc(doc(d, chemin), { uid: "alice", x: 2 }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), chemin)));
  });

  it("config/ia reste lisible par un compte connecté (non-régression)", async () => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), "config/ia"), { ok: true }),
    );
    await assertSucceeds(getDoc(doc(ctx("alice").firestore(), "config/ia")));
  });

  it("Storage liens/** : lecture et écriture refusées", async () => {
    const r = ref(ctx("alice").storage(), "liens/jeton/copie");
    await assertFails(
      uploadBytes(r, new Uint8Array(10), { contentType: "application/octet-stream" }),
    );
    await assertFails(getBytes(r));
  });
});

describe("configuration d'hébergement de la page de réception (/r)", () => {
  const fb = JSON.parse(readFileSync("firebase.json", "utf8"));
  const hosting = fb.hosting;
  const entetes = (source) =>
    Object.fromEntries(
      hosting.headers.find((h) => h.source === source).headers.map((h) => [h.key, h.value]),
    );

  it("la réécriture /r → recevoir.html et l'API précèdent le joker **", () => {
    const sources = hosting.rewrites.map((r) => r.source);
    expect(sources.indexOf("/r")).toBeGreaterThanOrEqual(0);
    expect(sources.indexOf("/r")).toBeLessThan(sources.indexOf("**"));
    expect(hosting.rewrites.find((r) => r.source === "/api/lien/ouvrir").function).toMatchObject({
      functionId: "ouvrirLienPartage",
    });
  });

  it.each(["/r", "/recevoir.html"])("%s : en-têtes de sécurité stricts", (source) => {
    const h = entetes(source);
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Cache-Control"]).toBe("no-store");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Robots-Tag"]).toContain("noindex");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    const csp = h["Content-Security-Policy"];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\//);
  });

  it("le fichier JavaScript de la page a aussi sa CSP", () => {
    expect(entetes("/assets/recevoir-*.js")["Content-Security-Policy"]).toContain(
      "default-src 'none'",
    );
  });
});
