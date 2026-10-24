import { beforeAll, describe, expect, it } from "vitest";
import { getBytes, ref } from "firebase/storage";
import { obtenirApp } from "../../src/firebase/app.js";
import * as fb from "../../src/firebase/index.js";

// Account backgrounds (V2.6) with the real Storage module against the emulators.
let uid;
beforeAll(async () => {
  const profil = await fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: "google-fonds",
        email: "fonds@nedotab.test",
        email_verified: true,
      }),
    }),
  });
  uid = profil.uid;
});

const image = (octets) => new Blob([new Uint8Array(octets)], { type: "image/webp" });

describe("fonds dans Storage (émulateurs)", () => {
  it("envoi avec progression, lecture, liste, suppression", async () => {
    const chemin = fb.cheminFond(uid, "test-1");
    const etapes = [];
    await fb.envoyerFond(chemin, image(300000), { surProgression: (p) => etapes.push(p) }).promesse;
    expect(etapes.at(-1)).toBe(1);
    // getBlob (used by the extension) exists only in browsers: read with getBytes here.
    const relu = await getBytes(ref(obtenirApp().stockage, chemin));
    expect(relu.byteLength).toBe(300000);
    expect(await fb.listerFondsStockage(uid)).toContain(chemin);
    await fb.supprimerFondStockage(chemin);
    expect(await fb.listerFondsStockage(uid)).not.toContain(chemin);
  });
  it("dans le dossier d'un autre utilisateur : refusé", async () => {
    await expect(
      fb.envoyerFond("users/autre/fonds/x.webp", image(10)).promesse,
    ).rejects.toMatchObject({
      code: "storage/unauthorized",
    });
  });
  it("plus de 5 Mo : refusé", async () => {
    await expect(
      fb.envoyerFond(fb.cheminFond(uid, "gros"), image(6 * 1024 * 1024)).promesse,
    ).rejects.toMatchObject({
      code: "storage/unauthorized",
    });
  });
  it("annulation de l'envoi", async () => {
    const envoi = fb.envoyerFond(fb.cheminFond(uid, "annule"), image(4 * 1024 * 1024));
    envoi.annuler();
    await expect(envoi.promesse).rejects.toMatchObject({ code: "storage/canceled" });
  });
});
