import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import * as fb from "../../src/firebase/index.js";
import { creerSynchro } from "../../src/ui/services/synchro.js";

// Live sync (V2.4) against the emulators: two "devices" (two sync instances with their own
// store and device id) on the same account.
const site = (id) => ({
  id,
  type: "site",
  titre: id,
  url: `https://${id}.fr`,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});

let uid;
beforeAll(async () => {
  const profil = await fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: "google-temps-reel",
        email: "tr@nedotab.test",
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

const actifs = [];
afterEach(async () => {
  // Stop every device of the test: their listeners would write into the next one.
  while (actifs.length) await actifs.pop().quitter({ garderCopie: true });
});

function appareil(nom, grille = [], delai = 300) {
  const store = creerStore({ ...etatInitial(), grille }, reduire);
  const prefs = {};
  const ecritures = vi.fn();
  const fbCompte = { ...fb, ecrireDocument: (...a) => (ecritures(), fb.ecrireDocument(...a)) };
  const synchro = creerSynchro({
    store,
    compte: { lire: () => ({ profil: { uid } }) },
    demanderChoix: async () => "fusion",
    charger: async () => fbCompte,
    plat: {
      preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) },
      copies: { enregistrer: async () => {}, lister: async () => [] },
      idAppareil: async () => nom,
    },
    delai,
  });
  actifs.push(synchro);
  const charges = vi.fn();
  store.abonner((_e, action) => action.type === A.CHARGER && charges(action));
  return { store, synchro, ecritures, charges };
}
const titres = (s) =>
  s
    .lire()
    .grille.map((e) => e.id)
    .join(",");
const enLigne = async () => (await fb.lireDocument(uid))?.brut.grille.map((e) => e.id).join(",");

describe("synchronisation en temps réel (émulateurs)", () => {
  it("20 actions rapides → une seule écriture", async () => {
    const a = appareil("A", [site("s0")]);
    await a.synchro.lancerPremiereSynchro();
    a.ecritures.mockClear();
    for (let i = 1; i <= 20; i++) {
      a.store.envoyer({ type: A.SITE_AJOUTER, site: site(`s${i}`) });
      await new Promise((r) => setTimeout(r, 10));
    }
    await vi.waitFor(async () => expect((await enLigne()).split(",")).toHaveLength(21), {
      timeout: 4000,
    });
    expect(a.ecritures).toHaveBeenCalledTimes(1);
  });

  it("A modifie → B reçoit en moins de 2 s, sans écrire (pas de ping-pong), A ignore son écho", async () => {
    const a = appareil("A", [site("x")]);
    await a.synchro.lancerPremiereSynchro();
    const b = appareil("B");
    await b.synchro.lancerPremiereSynchro(); // empty → gets the account's grid
    expect(titres(b.store)).toBe("x");
    b.ecritures.mockClear();
    a.charges.mockClear();
    const debut = Date.now();
    a.store.envoyer({ type: A.SITE_AJOUTER, site: site("y") });
    await vi.waitFor(() => expect(titres(b.store)).toBe("x,y"), { timeout: 2500, interval: 50 });
    expect(Date.now() - debut).toBeLessThan(2000 + 300);
    await new Promise((r) => setTimeout(r, 800));
    expect(b.ecritures).not.toHaveBeenCalled();
    expect(a.charges).not.toHaveBeenCalled();
    expect(b.charges.mock.calls.every(([action]) => action.origine === "distant")).toBe(true);
  });

  it("changement local en attente rejoué sur le changement reçu : rien de perdu", async () => {
    const a = appareil("A", [site("x")]);
    await a.synchro.lancerPremiereSynchro();
    // B writes later than A (longer debounce): its change is still pending when A's arrives.
    // (Two writes at the very same time are the conflicts of V2.9: here the last one wins.)
    const b = appareil("B", [], 2000);
    await b.synchro.lancerPremiereSynchro();
    a.store.envoyer({ type: A.SITE_AJOUTER, site: site("deA") });
    b.store.envoyer({ type: A.SITE_AJOUTER, site: site("deB") });
    await vi.waitFor(
      async () => {
        expect(titres(b.store).split(",").sort()).toEqual(["deA", "deB", "x"]);
        expect((await enLigne()).split(",").sort()).toEqual(["deA", "deB", "x"]);
      },
      { timeout: 5000, interval: 100 },
    );
  });

  it("réglages synchronisés, fond image local jamais envoyé", async () => {
    const a = appareil("A", [site("x")]);
    await a.synchro.lancerPremiereSynchro();
    const b = appareil("B");
    await b.synchro.lancerPremiereSynchro();
    a.store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { theme: "sombre" } });
    a.store.envoyer({
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "image", ref: "local:a", dominante: "#000000" } },
    });
    await vi.waitFor(() => expect(b.store.lire().reglages.theme).toBe("sombre"), { timeout: 3000 });
    expect(b.store.lire().reglagesAppareil).toEqual({});
    expect((await fb.lireDocument(uid)).brut.reglages.fond).toEqual({ type: "aucun" });
  });
});
