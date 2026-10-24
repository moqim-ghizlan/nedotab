import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { etatInitial } from "../../src/core/modele.js";
import * as fb from "../../src/firebase/index.js";

// Offline write (V2.5) against the emulators: network off → write → network on → on the server.
let uid;
beforeAll(async () => {
  const profil = await fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: "google-hors-ligne",
        email: "hl@nedotab.test",
        email_verified: true,
      }),
    }),
  });
  uid = profil.uid;
});
afterAll(() => fb.reseau(true));

async function surLeServeur() {
  const r = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents/users/${uid}`,
    { headers: { authorization: "Bearer owner" } },
  );
  if (!r.ok) return null;
  const d = await r.json();
  return (d.fields.grille.arrayValue.values ?? []).map((v) => v.mapValue.fields.id.stringValue);
}

describe("hors ligne (émulateurs)", () => {
  it("écriture hors ligne mise en file puis envoyée au retour du réseau", async () => {
    await fb.ecrireDocument(uid, { ...etatInitial(), grille: [] }, "A", 1);
    await fb.reseau(false);
    const etat = {
      ...etatInitial(),
      grille: [{ id: "hors-ligne", type: "site", titre: "x", url: "https://x.fr" }],
    };
    let confirme = false;
    const envoi = fb.ecrireDocument(uid, etat, "A", 2).then(() => (confirme = true));
    await new Promise((r) => setTimeout(r, 800));
    expect(confirme).toBe(false); // queued locally, not on the server yet
    expect(await surLeServeur()).toEqual([]);
    await fb.reseau(true);
    await envoi;
    expect(await surLeServeur()).toEqual(["hors-ligne"]);
  });
});
