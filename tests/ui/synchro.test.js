import { afterEach, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { expliquer } from "../../src/core/rejeu.js";
import { creerStore } from "../../src/core/store.js";
import { creerSynchro } from "../../src/ui/services/synchro.js";

afterEach(() => vi.useRealTimers());

const site = (id, titre = id) => ({ id, type: "site", titre, url: `https://${id}.fr`, creeLe: 0 });
const ids = (store) => store.lire().grille.map((e) => e.id);

/** In-memory account document with Firestore-like transactions and listeners. */
function serveurFactice(initial = null) {
  let document = initial;
  const ecouteurs = new Set();
  const diffuser = () =>
    queueMicrotask(() =>
      ecouteurs.forEach((cb) => cb(document, { ecritureEnAttente: false, depuisCache: false })),
    );
  const fb = {
    lireDocument: vi.fn(async () => document && { brut: document, majLe: null }),
    ecrireDocument: vi.fn(async (_uid, etat, majPar, revision) => {
      document = {
        versionSchema: 2,
        grille: etat.grille,
        reglages: etat.reglages,
        majPar,
        revision,
      };
      diffuser();
    }),
    ecrireParTransaction: vi.fn(async (_uid, calculer, majPar) => {
      const r = calculer(document);
      document = {
        versionSchema: 2,
        grille: r.etat.grille,
        reglages: r.etat.reglages,
        majPar,
        revision: r.revision,
      };
      diffuser();
      return r;
    }),
    ecouterDocument: vi.fn((_uid, cb) => {
      ecouteurs.add(cb);
      if (document) diffuser();
      return () => ecouteurs.delete(cb);
    }),
  };
  /** A change made by another device. */
  const autreAppareil = (f) => {
    const actuel = { ...etatInitial(), ...document };
    const suivant = f(actuel);
    document = {
      ...document,
      grille: suivant.grille,
      reglages: suivant.reglages,
      majPar: "autre",
      revision: (document?.revision ?? 0) + 1,
    };
    diffuser();
  };
  return { fb, lire: () => document, autreAppareil };
}

function zoneOperations(initial = {}) {
  const zone = new Map(Object.entries(initial));
  return {
    zone,
    ecrire: async (id, v) => void zone.set(id, v),
    supprimer: async (id) => void zone.delete(id),
    toutes: async () => Object.fromEntries(zone),
    surChangement: () => () => {},
  };
}

async function monter({ grille = [site("a"), site("b")], serveur, operations, prefs = {} } = {}) {
  const s = serveur ?? serveurFactice();
  const store = creerStore({ ...etatInitial(), grille }, reduire);
  const signalerIgnorees = vi.fn();
  const ops = operations ?? zoneOperations();
  const synchro = creerSynchro({
    store,
    compte: { lire: () => ({ profil: { uid: "u" } }) },
    demanderChoix: async () => "compte",
    signalerIgnorees,
    charger: async () => s.fb,
    plat: {
      preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) },
      copies: { enregistrer: async () => {}, lister: async () => [] },
      idAppareil: async () => "moi",
      operations: ops,
    },
    verrous: null,
    idOnglet: "onglet-1",
  });
  return { ...s, store, synchro, signalerIgnorees, ops, prefs };
}
async function connecte(options) {
  const m = await monter(options);
  await m.synchro.lancerPremiereSynchro();
  await vi.advanceTimersByTimeAsync(0);
  m.fb.ecrireParTransaction.mockClear();
  return m;
}

describe("synchro : écritures par transaction", () => {
  it("20 actions en 1 s → 1 seule transaction, 1,5 s après la dernière", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    for (let i = 0; i < 20; i++) {
      m.store.envoyer({ type: A.SITE_AJOUTER, site: site(`s${i}`) });
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(1400);
    expect(m.fb.ecrireParTransaction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(1);
    expect(m.lire().grille).toHaveLength(22);
    expect(m.synchro.modificationsNonEnvoyees()).toBe(0);
  });

  it("la file est persistée et vidée seulement après confirmation", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    let confirmer;
    m.fb.ecrireParTransaction.mockImplementationOnce(
      (_u, calculer) => new Promise((r) => (confirmer = () => r(calculer(m.lire())))),
    );
    m.store.envoyer({ type: A.ELEMENT_SUPPRIMER, id: "a" });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.ops.zone.get("onglet-1")).toMatchObject({
      uid: "u",
      file: [{ libelle: "Supprimer « a »" }],
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.ops.zone.get("onglet-1").file).toHaveLength(1); // not confirmed yet
    confirmer();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.ops.zone.has("onglet-1")).toBe(false);
  });

  it("un changement d'un autre appareil n'efface pas une modification locale en attente", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("local") });
    m.autreAppareil((e) =>
      reduire(e, { type: A.SITE_MODIFIER, id: "b", changements: { titre: "Renommé" } }),
    );
    await vi.advanceTimersByTimeAsync(0);
    // Shown at once: the other device's change AND the local one.
    expect(ids(m.store)).toEqual(["a", "b", "local"]);
    expect(m.store.lire().grille[1].titre).toBe("Renommé");
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.lire().grille.map((e) => e.titre)).toEqual(["a", "Renommé", "local"]);
  });

  it("opération devenue impossible : ignorée et signalée", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.store.envoyer({ type: A.SITE_MODIFIER, id: "a", changements: { titre: "GitHub" } });
    m.autreAppareil((e) => reduire(e, { type: A.ELEMENT_SUPPRIMER, id: "a" }));
    await vi.advanceTimersByTimeAsync(1600);
    expect(ids(m.store)).toEqual(["b"]);
    expect(m.signalerIgnorees).toHaveBeenCalledTimes(1);
    const [ignorees] = m.signalerIgnorees.mock.calls[0];
    expect(ignorees.map(expliquer)).toEqual(["Renommer « a » → ignoré, site supprimé ailleurs"]);
  });

  it("toutes appliquées : rien n'est signalé", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.signalerIgnorees).not.toHaveBeenCalled();
  });

  it("un changement distant est appliqué et ne déclenche jamais d'écriture", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.autreAppareil((e) => ({ ...e, grille: [...e.grille, site("c")] }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(ids(m.store)).toEqual(["a", "b", "c"]);
    expect(m.fb.ecrireParTransaction).not.toHaveBeenCalled();
  });

  it("un instantané d'une écriture en attente (première synchro) est ignoré", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    const avant = m.store.lire();
    m.fb.ecouterDocument.mock.calls[0][1](
      { versionSchema: 2, grille: [site("z")], reglages: {}, majPar: "autre", revision: 99 },
      { ecritureEnAttente: true },
    );
    expect(m.store.lire()).toBe(avant);
  });

  it("état distant identique : pas de nouveau rendu", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    const avant = m.store.lire();
    m.autreAppareil((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.store.lire()).toBe(avant);
  });

  it("un instantané plus ancien que notre écriture ne masque pas nos opérations", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    const ancien = { ...m.lire() };
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    await vi.advanceTimersByTimeAsync(1600);
    m.fb.ecouterDocument.mock.calls[0][1](ancien, { ecritureEnAttente: false });
    expect(ids(m.store)).toContain("n");
  });

  it("indicateur : attente puis synchronisé", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    expect(m.synchro.lire().statut).toBe("attente");
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.synchro.lire().statut).toBe("synchronise");
  });

  it("erreur d'accès : ⚠ avec message, puis réessais 1 s, 2 s, 4 s ; la file reste", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.fb.ecrireParTransaction.mockRejectedValue(
      Object.assign(new Error("x"), { code: "permission-denied" }),
    );
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.synchro.lire()).toMatchObject({
      statut: "erreur",
      erreur: expect.stringMatching(/reconnectez-vous/),
    });
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(600);
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(3);
    expect(m.synchro.modificationsNonEnvoyees()).toBe(1);
    m.fb.ecrireParTransaction.mockRestore?.();
  });

  it("hors ligne : aucune transaction ; envoyée au retour du réseau", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    window.dispatchEvent(new Event("offline"));
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.fb.ecrireParTransaction).not.toHaveBeenCalled();
    expect(m.synchro.lire().statut).toBe("hors-ligne");
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(1);
    expect(m.lire().grille.map((e) => e.id)).toContain("n");
  });

  it("restauration : envoyée aussitôt et remplace les opérations antérieures", async () => {
    vi.useFakeTimers();
    const m = await connecte();
    m.store.envoyer({ type: A.SITE_AJOUTER, site: site("n") });
    m.store.envoyer({
      type: A.GRILLE_RESTAURER,
      etat: { grille: [site("r")], reglages: m.store.lire().reglages },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.fb.ecrireParTransaction).toHaveBeenCalledTimes(1);
    expect(m.lire().grille.map((e) => e.id)).toEqual(["r"]);
    expect(m.synchro.modificationsNonEnvoyees()).toBe(0);
  });
});

describe("démarrage : opérations laissées par un onglet fermé", () => {
  it("reprises puis envoyées dès que le serveur répond", async () => {
    vi.useFakeTimers();
    const serveur = serveurFactice({
      versionSchema: 2,
      grille: [site("a"), site("b"), site("autre")],
      reglages: etatInitial().reglages,
      majPar: "autre",
      revision: 4,
    });
    const operations = zoneOperations({
      ancien: {
        uid: "u",
        file: [
          { idOp: "x1", creeLe: 1, action: { type: A.SITE_AJOUTER, site: site("horsLigne") } },
        ],
      },
      autreCompte: {
        uid: "v",
        file: [{ idOp: "y", creeLe: 1, action: { type: A.ELEMENT_SUPPRIMER, id: "a" } }],
      },
    });
    const m = await monter({ serveur, operations, prefs: { synchro: { uid: "u" } } });
    await m.synchro.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(ids(m.store)).toEqual(["a", "b", "autre", "horsLigne"]);
    expect(operations.zone.has("ancien")).toBe(false);
    expect(operations.zone.has("autreCompte")).toBe(true); // another account's: untouched
    await vi.advanceTimersByTimeAsync(1600);
    expect(serveur.lire()).toMatchObject({ revision: 5 });
    expect(serveur.lire().grille.map((e) => e.id)).toEqual(["a", "b", "autre", "horsLigne"]);
  });

  it("file d'un onglet encore ouvert : affichée, pas envoyée par cet onglet", async () => {
    vi.useFakeTimers();
    const serveur = serveurFactice({
      versionSchema: 2,
      grille: [site("a")],
      reglages: etatInitial().reglages,
      majPar: "autre",
      revision: 1,
    });
    const operations = zoneOperations({
      vivant: {
        uid: "u",
        file: [{ idOp: "v1", creeLe: 1, action: { type: A.SITE_AJOUTER, site: site("v") } }],
      },
    });
    const store = creerStore({ ...etatInitial(), grille: [site("a")] }, reduire);
    const prefs = { synchro: { uid: "u" } };
    const synchro = creerSynchro({
      store,
      compte: { lire: () => ({ profil: { uid: "u" } }) },
      demanderChoix: async () => null,
      charger: async () => serveur.fb,
      plat: {
        preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) },
        copies: { enregistrer: async () => {}, lister: async () => [] },
        idAppareil: async () => "moi",
        operations,
      },
      verrous: {
        request: (nom, f) => (nom === "nedotab-reprise-files" ? f() : new Promise(() => {})),
        query: async () => ({ held: [{ name: "nedotab-onglet:vivant" }] }),
      },
      idOnglet: "moi",
    });
    await synchro.demarrer();
    await vi.advanceTimersByTimeAsync(3000);
    expect(ids(store)).toEqual(["a", "v"]);
    expect(serveur.fb.ecrireParTransaction).not.toHaveBeenCalled();
    expect(operations.zone.has("vivant")).toBe(true);
  });
});
