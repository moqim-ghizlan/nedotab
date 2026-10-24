import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import * as fb from "../../src/firebase/index.js";
import { creerRestauration } from "../../src/ui/services/restauration.js";
import { creerSauvegardes } from "../../src/ui/services/sauvegardes.js";
import { creerSynchro } from "../../src/ui/services/synchro.js";

// Restoration (V2.8) end to end against the emulators: synced device, manual backup,
// changes, restore (written online at once), undo.
const site = (id) => ({
  id,
  type: "site",
  titre: id,
  url: `https://${id}.fr`,
  icone: { type: "lettre", couleur: "#000000" },
  creeLe: 0,
});
let uid;
let synchro;
beforeAll(async () => {
  const profil = await fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: "google-restauration",
        email: "r@nedotab.test",
        email_verified: true,
      }),
    }),
  });
  uid = profil.uid;
  await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/demo-nedotab/databases/(default)/documents",
    { method: "DELETE" },
  );
});
afterAll(() => synchro?.quitter({ garderCopie: true }));

const enLigne = async () => (await fb.lireDocument(uid)).brut.grille.map((e) => e.id).join(",");

describe("restauration (émulateurs)", () => {
  it("sauvegarde, modifications, restauration écrite en ligne, puis annulation", async () => {
    const store = creerStore(
      { ...etatInitial(), grille: [site("a"), site("b"), site("c")] },
      reduire,
    );
    const prefs = {};
    const plat = {
      preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) },
      copies: { enregistrer: async () => {}, lister: async () => [] },
      idAppareil: async () => "R",
    };
    const compte = { lire: () => ({ profil: { uid } }) };
    synchro = creerSynchro({
      store,
      compte,
      demanderChoix: async () => null,
      charger: async () => fb,
      plat,
      delai: 200,
    });
    const session = { compte, synchro };
    const sauvegardes = creerSauvegardes({ store, session, charger: async () => fb, plat });
    const restauration = creerRestauration({ store, session, charger: async () => fb, plat });
    await synchro.lancerPremiereSynchro();
    const { id } = await sauvegardes.sauvegarderManuelle("Avant grand rangement");

    // Reorganise and delete
    store.envoyer({ type: A.ELEMENT_SUPPRIMER, id: "a" });
    store.envoyer({ type: A.ELEMENT_DEPLACER, id: "c", versParentId: null, versIndex: 0 });
    await vi.waitFor(async () => expect(await enLigne()).toBe("c,b"), { timeout: 3000 });

    // Restore the manual backup: written online at once
    const { sauvegardes: liste } = await fb.listerSauvegardes(uid, { taille: 50 });
    const cible = liste.find((s) => s.id === id);
    const r = await restauration.restaurer(cible);
    expect(r.ok).toBe(true);
    expect(
      store
        .lire()
        .grille.map((e) => e.id)
        .join(","),
    ).toBe("a,b,c");
    await vi.waitFor(async () => expect(await enLigne()).toBe("a,b,c"), { timeout: 1500 });
    const apres = (await fb.listerSauvegardes(uid, { taille: 50 })).sauvegardes;
    const avant = apres.find((s) => s.type === "avant-restauration");
    expect(avant.nom).toMatch(/^Avant la restauration du \d\d\/\d\d\/\d{4} \d\d:\d\d$/);
    expect(avant.grille.map((e) => e.id).join(",")).toBe("c,b");

    // Undo: back to the reorganised state, without a new safety copy
    r.annuler();
    await vi.waitFor(async () => expect(await enLigne()).toBe("c,b"), { timeout: 1500 });
    const fin = (await fb.listerSauvegardes(uid, { taille: 50 })).sauvegardes;
    expect(fin.filter((s) => s.type === "avant-restauration")).toHaveLength(1);
  }, 30000);
});
