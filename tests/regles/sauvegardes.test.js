import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import * as fb from "../../src/firebase/index.js";
import { appareilCourant } from "../../src/firebase/sauvegardes.js";
import { creerSauvegardes } from "../../src/ui/services/sauvegardes.js";

// Backups (V2.7) with the real modules against the emulators.
let uid;
beforeAll(async () => {
  const profil = await fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: "google-sauvegardes",
        email: "s@nedotab.test",
        email_verified: true,
      }),
    }),
  });
  uid = profil.uid;
});
beforeEach(async () => {
  await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/demo-nedotab/databases/(default)/documents",
    {
      method: "DELETE",
    },
  );
});

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });
function service(grille) {
  const store = creerStore({ ...etatInitial(), grille }, reduire);
  const prefs = {};
  const s = creerSauvegardes({
    store,
    session: {
      compte: { lire: () => ({ profil: { uid } }) },
      synchro: { lire: () => ({ mode: "compte" }) },
    },
    charger: async () => fb,
    plat: { preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) } },
  });
  return { s, store, prefs };
}
const toutes = async () => (await fb.listerSauvegardes(uid, { taille: 100 })).sauvegardes;

describe("sauvegardes (émulateurs)", () => {
  it("sauvegarde automatique : créée une fois, puis rien pendant une heure ni dans la journée", async () => {
    const { s, prefs } = service([site("a")]);
    expect(await s.verifierAuto()).toBe("cree");
    expect(await s.verifierAuto()).toBe("plus-tard"); // checked less than an hour ago
    prefs.sauvegardeAuto.verifieLe = 0; // an hour later
    expect(await s.verifierAuto()).toBe("inutile"); // less than 24 h since the last one
    const liste = await toutes();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      type: "auto",
      nom: null,
      appareil: appareilCourant(), // "extension", or the web app's kind of device
      nbSites: 1,
      nbDossiers: 0,
    });
  });
  it("grille vide : pas de sauvegarde automatique", async () => {
    const { s } = service([]);
    expect(await s.verifierAuto()).toBe("inutile");
    expect(await toutes()).toHaveLength(0);
  });
  it("rotation : 32 automatiques forcées → 30 gardées, manuelles intactes", async () => {
    const { s } = service([site("a")]);
    expect((await s.sauvegarderManuelle("Avant grand rangement")).ok).toBe(true);
    for (let i = 0; i < 32; i++) await s.verifierAuto({ forcer: true });
    const liste = await toutes();
    expect(liste.filter((x) => x.type === "auto")).toHaveLength(30);
    expect(liste.filter((x) => x.type === "manuelle").map((x) => x.nom)).toEqual([
      "Avant grand rangement",
    ]);
  }, 60000);
  it("50 sauvegardes manuelles au plus", async () => {
    const { s } = service([site("a")]);
    for (let i = 0; i < 50; i++)
      await fb.creerSauvegarde(
        uid,
        { ...etatInitial(), grille: [site("a")] },
        { type: "manuelle", nom: `n${i}` },
      );
    const r = await s.sauvegarderManuelle("une de trop");
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/50 sauvegardes manuelles/);
  }, 60000);
  it("liste par pages de 20, plus récentes d'abord, filtre par type", async () => {
    for (let i = 0; i < 25; i++)
      await fb.creerSauvegarde(
        uid,
        { ...etatInitial(), grille: [] },
        { type: i % 2 ? "auto" : "manuelle", nom: i % 2 ? null : `m${i}` },
      );
    const page1 = await fb.listerSauvegardes(uid);
    expect(page1.sauvegardes).toHaveLength(20);
    expect(page1.sauvegardes[0].creeLe).toBeGreaterThanOrEqual(page1.sauvegardes[19].creeLe);
    const page2 = await fb.listerSauvegardes(uid, { apres: page1.suite });
    expect(page2.sauvegardes).toHaveLength(5);
    expect(page2.suite).toBeNull();
    const manuelles = await fb.listerSauvegardes(uid, { type: "manuelle", taille: 50 });
    expect(manuelles.sauvegardes.every((x) => x.type === "manuelle")).toBe(true);
    expect(manuelles.sauvegardes).toHaveLength(13);
  }, 60000);
});
