import { afterEach, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerSynchro } from "../../src/ui/services/synchro.js";

afterEach(() => vi.useRealTimers());

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });

async function monter() {
  let recevoir;
  const fb = {
    lireDocument: vi.fn(async () => null),
    ecrireDocument: vi.fn(async () => {}),
    ecouterDocument: vi.fn((_uid, cb) => ((recevoir = cb), () => {})),
  };
  const store = creerStore({ ...etatInitial(), grille: [site("a")] }, reduire);
  const synchro = creerSynchro({
    store,
    compte: { lire: () => ({ profil: { uid: "u" } }) },
    demanderChoix: async () => null,
    charger: async () => fb,
    plat: {
      preferences: { lire: async () => undefined, ecrire: async () => {} },
      copies: { enregistrer: async () => {}, lister: async () => [] },
      idAppareil: async () => "moi",
    },
  });
  await synchro.lancerPremiereSynchro();
  fb.ecrireDocument.mockClear();
  return { fb, store, synchro, recevoir: (...a) => recevoir(...a) };
}

describe("synchro : écritures et réception", () => {
  it("20 actions en 1 s → 1 seule écriture, 1,5 s après la dernière", async () => {
    vi.useFakeTimers();
    const m = await monter();
    for (let i = 0; i < 20; i++) {
      m.store.envoyer({ type: A.SITE_AJOUTER, site: site(`s${i}`) });
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(1400);
    expect(m.fb.ecrireDocument).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(m.fb.ecrireDocument).toHaveBeenCalledTimes(1);
  });

  it("un instantané de notre écriture en attente est ignoré", async () => {
    const m = await monter();
    const avant = m.store.lire();
    m.recevoir(
      { versionSchema: 2, grille: [site("z")], reglages: {}, majPar: "autre", revision: 99 },
      { ecritureEnAttente: true },
    );
    expect(m.store.lire()).toBe(avant);
  });

  it("notre propre écho (même appareil, révision déjà vue) est ignoré", async () => {
    const m = await monter();
    const avant = m.store.lire();
    m.recevoir(
      { versionSchema: 2, grille: [site("z")], reglages: {}, majPar: "moi", revision: 1 },
      { ecritureEnAttente: false },
    );
    expect(m.store.lire()).toBe(avant);
  });

  it("un changement distant est appliqué et ne déclenche jamais d'écriture", async () => {
    vi.useFakeTimers();
    const m = await monter();
    m.recevoir(
      {
        versionSchema: 2,
        grille: [site("a"), site("b")],
        reglages: { theme: "sombre", fond: { type: "aucun" } },
        majPar: "autre",
        revision: 5,
      },
      { ecritureEnAttente: false },
    );
    expect(m.store.lire().grille.map((e) => e.id)).toEqual(["a", "b"]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.fb.ecrireDocument).not.toHaveBeenCalled();
  });

  it("état distant identique : pas de nouveau rendu", async () => {
    const m = await monter();
    const avant = m.store.lire();
    m.recevoir({ ...avant, majPar: "autre", revision: 7 }, { ecritureEnAttente: false });
    expect(m.store.lire()).toBe(avant);
  });

  it("indicateur : attente puis synchronisé", async () => {
    vi.useFakeTimers();
    const m = await monter();
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    expect(m.synchro.lire().statut).toBe("attente");
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.synchro.lire().statut).toBe("synchronise");
  });

  it("erreur d'accès : indicateur ⚠ avec message", async () => {
    vi.useFakeTimers();
    const m = await monter();
    m.fb.ecrireDocument.mockRejectedValueOnce(
      Object.assign(new Error("x"), { code: "permission-denied" }),
    );
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.synchro.lire()).toMatchObject({
      statut: "erreur",
      erreur: expect.stringMatching(/reconnectez-vous/),
    });
  });
});

describe("démarrage après une fermeture pendant un envoi", () => {
  it("l'état local est envoyé avant d'écouter le compte", async () => {
    const ordre = [];
    const fb = {
      ecrireDocument: vi.fn(async () => ordre.push("ecrire")),
      ecouterDocument: vi.fn(() => (ordre.push("ecouter"), () => {})),
    };
    const prefs = { synchro: { uid: "u" }, synchroEnAttente: true };
    const synchro = creerSynchro({
      store: creerStore({ ...etatInitial(), grille: [site("a")] }, reduire),
      compte: { lire: () => ({ profil: { uid: "u" } }) },
      demanderChoix: async () => null,
      charger: async () => fb,
      plat: {
        preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) },
        copies: { enregistrer: async () => {}, lister: async () => [] },
        idAppareil: async () => "moi",
      },
    });
    await synchro.demarrer();
    expect(ordre).toEqual(["ecrire", "ecouter"]);
    expect(prefs.synchroEnAttente).toBe(false);
  });
});
