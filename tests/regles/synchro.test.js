import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import * as fb from "../../src/firebase/index.js";
import { creerSynchro } from "../../src/ui/services/synchro.js";

// First synchronisation, the 4 cases, against the emulators (Auth + Firestore with the real
// rules): what ends up locally and online.
const site = (id, url = `https://${id}.fr`) => ({
  id,
  type: "site",
  titre: id,
  url,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});
const etat = (grille) => ({ ...etatInitial(), grille });

let uid;
beforeAll(async () => {
  const profil = await fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: "google-synchro",
        email: "synchro@nedotab.test",
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

function monter(grilleLocale, choix = null) {
  const store = creerStore(etat(grilleLocale), reduire);
  const prefs = {};
  const copies = [];
  const plat = {
    preferences: { lire: async (c) => prefs[c], ecrire: async (c, v) => (prefs[c] = v) },
    copies: {
      enregistrer: async (e) => copies.unshift(structuredClone(e)),
      lister: async () => copies.map((e, i) => ({ cle: `c${i}`, date: 0, etat: e })),
    },
    idAppareil: async () => "appareil-test",
  };
  const demanderChoix = vi.fn(async () => choix);
  const synchro = creerSynchro({
    store,
    compte: { lire: () => ({ profil: { uid } }) },
    demanderChoix,
    charger: async () => fb,
    plat,
    delai: 10,
  });
  return { store, synchro, prefs, copies, demanderChoix };
}

const enLigne = async () => (await fb.lireDocument(uid))?.brut;
const ids = (grille) => grille.map((e) => e.id).join(",");

describe("première synchronisation (émulateurs)", () => {
  it("vide / vide : document créé en ligne", async () => {
    const m = monter([]);
    expect(await m.synchro.lancerPremiereSynchro()).toBe("cree");
    const d = await enLigne();
    expect(d.grille).toEqual([]);
    expect(Object.keys(d).sort()).toEqual([
      "grille",
      "majLe",
      "majPar",
      "reglages",
      "revision",
      "versionSchema",
    ]);
    expect(m.prefs.synchro).toEqual({ uid });
  });

  it("local / vide : la grille locale est envoyée, sans champ inattendu ni image", async () => {
    const m = monter([site("a"), site("b")]);
    m.store.envoyer({
      type: "REGLAGES_MODIFIER",
      changements: { fond: { type: "image", ref: "local:x", dominante: "#000000" } },
    });
    expect(await m.synchro.lancerPremiereSynchro()).toBe("envoye");
    const d = await enLigne();
    expect(ids(d.grille)).toBe("a,b");
    expect(d.reglages.fond).toEqual({ type: "aucun" }); // the local picture stays local
    expect(d).not.toHaveProperty("reglagesAppareil");
    expect(m.copies).toHaveLength(1); // safety copy written first
  });

  it("vide / compte : la grille du compte est récupérée", async () => {
    await fb.ecrireDocument(uid, etat([site("x"), site("y")]), "autre", 1);
    const m = monter([]);
    expect(await m.synchro.lancerPremiereSynchro()).toBe("recupere");
    expect(ids(m.store.lire().grille)).toBe("x,y");
  });

  it("identiques des deux côtés : rien à demander", async () => {
    await fb.ecrireDocument(uid, etat([site("a")]), "autre", 1);
    const m = monter([{ ...site("a"), creeLe: 999 }]);
    expect(await m.synchro.lancerPremiereSynchro()).toBe("identique");
    expect(m.demanderChoix).not.toHaveBeenCalled();
  });

  it("les deux : « Garder ceux du compte »", async () => {
    await fb.ecrireDocument(uid, etat([site("x")]), "autre", 1);
    const m = monter([site("a")], "compte");
    expect(await m.synchro.lancerPremiereSynchro()).toBe("compte");
    expect(ids(m.store.lire().grille)).toBe("x");
    expect(ids(m.copies[0].grille)).toBe("a"); // this computer's sites kept in a copy
    expect(m.demanderChoix.mock.calls[0][0]).toMatchObject({
      local: { sites: 1, dossiers: 0 },
      compte: { sites: 1, dossiers: 0 },
    });
  });

  it("les deux : « Garder ceux de cet ordinateur » (sauvegarde du compte d'abord)", async () => {
    await fb.ecrireDocument(uid, etat([site("x")]), "autre", 1);
    const m = monter([site("a")], "local");
    expect(await m.synchro.lancerPremiereSynchro()).toBe("local");
    expect(ids((await enLigne()).grille)).toBe("a");
  });

  it("les deux : « Fusionner » sans doublon, dans un dossier Importé", async () => {
    await fb.ecrireDocument(uid, etat([site("x", "https://commun.fr")]), "autre", 1);
    const m = monter([site("a", "https://www.commun.fr/"), site("b")], "fusion");
    expect(await m.synchro.lancerPremiereSynchro()).toBe("fusion");
    const g = m.store.lire().grille;
    expect(g[0].id).toBe("x");
    expect(g[1].titre).toMatch(/^Importé de cet ordinateur — \d\d\/\d\d\/\d{4}$/);
    expect(ids(g[1].items)).toBe("b");
    expect(ids((await enLigne()).grille)).toBe(ids(g));
  });

  it("les deux : Annuler → mode local, rien n'est écrit", async () => {
    await fb.ecrireDocument(uid, etat([site("x")]), "autre", 1);
    const m = monter([site("a")], null);
    expect(await m.synchro.lancerPremiereSynchro()).toBe("annule");
    expect(m.synchro.lire().mode).toBe("local");
    expect(ids((await enLigne()).grille)).toBe("x");
    expect(ids(m.store.lire().grille)).toBe("a");
  });

  it("données du compte d'une version future : rien n'est écrasé", async () => {
    await fb.ecrireDocument(uid, { ...etat([site("x")]), versionSchema: 9 }, "autre", 1);
    const m = monter([site("a")], "local");
    expect(await m.synchro.lancerPremiereSynchro()).toBe("erreur");
    expect((await enLigne()).versionSchema).toBe(9);
  });

  it("ensuite, chaque modification locale est envoyée (regroupée)", async () => {
    const m = monter([site("a")]);
    await m.synchro.lancerPremiereSynchro();
    m.store.envoyer({ type: "SITE_AJOUTER", site: site("b") });
    m.store.envoyer({ type: "SITE_AJOUTER", site: site("c") });
    await vi.waitFor(async () => expect(ids((await enLigne()).grille)).toBe("a,b,c"), {
      timeout: 3000,
    });
  });

  it("deux clics : une seule synchronisation à la fois", async () => {
    const m = monter([site("a")]);
    const [r1, r2] = await Promise.all([
      m.synchro.lancerPremiereSynchro(),
      m.synchro.lancerPremiereSynchro(),
    ]);
    expect([r1, r2].sort()).toEqual(["envoye", "occupe"]);
  });

  it("déconnexion sans copie : grille vide ; restauration de la copie", async () => {
    const m = monter([site("a")]);
    await m.synchro.lancerPremiereSynchro();
    await m.synchro.quitter({ garderCopie: false });
    expect(m.store.lire().grille).toEqual([]);
    expect(m.synchro.lire().mode).toBe("local");
    expect(await m.synchro.restaurerCopie()).toBe(true);
    expect(ids(m.store.lire().grille)).toBe("a");
  });
});
