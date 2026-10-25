import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { creerServicesStockage } from "../../src/platform/servicesStockage.js";
import { creerZoneWeb } from "../../src/platform/zoneWeb.js";

/** BroadcastChannel between "tabs" of one test: same name, delivered to the others only. */
function canaux() {
  const abonnes = new Map();
  return class Canal {
    constructor(nom) {
      this.nom = nom;
      this.ecouteurs = new Set();
      if (!abonnes.has(nom)) abonnes.set(nom, new Set());
      abonnes.get(nom).add(this);
    }
    addEventListener(_type, f) {
      this.ecouteurs.add(f);
    }
    postMessage(donnees) {
      for (const autre of abonnes.get(this.nom)) {
        if (autre === this) continue;
        const copie = structuredClone(donnees);
        queueMicrotask(() => autre.ecouteurs.forEach((f) => f({ data: copie })));
      }
    }
    close() {
      abonnes.get(this.nom).delete(this);
    }
  };
}

/** Two tabs of the same browser: one IndexedDB, one channel. */
function deuxOnglets() {
  const indexedDB = new IDBFactory();
  const Canal = canaux();
  const onglet = () => {
    const z = creerZoneWeb({ indexedDB, Canal });
    return creerServicesStockage(
      () => z.zone,
      () => z.evenements,
    );
  };
  return [onglet(), onglet()];
}
const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("stockage de l'application web (IndexedDB + BroadcastChannel)", () => {
  it("charge null au départ, puis relit ce qui a été écrit, sans les métadonnées", async () => {
    const [a] = deuxOnglets();
    expect(await a.stockage().charger()).toBeNull();
    const meta = await a.stockage().sauvegarder({ grille: [{ id: "s1" }] });
    expect(meta.ecritPar).toBe(a.stockage().idInstance);
    const lu = await a.stockage().lire();
    expect(lu.etat).toEqual({ grille: [{ id: "s1" }] });
    expect(lu.meta.majLe).toBe(meta.majLe);
  });

  it("l'autre onglet est prévenu et relit l'état ; l'onglet qui écrit ignore son propre écho", async () => {
    const [a, b] = deuxOnglets();
    const vusParA = [];
    const vusParB = [];
    a.stockage().surChangementExterne((etat) => vusParA.push(etat));
    b.stockage().surChangementExterne((etat, meta) => vusParB.push({ etat, meta }));
    await a.stockage().sauvegarder({ grille: [{ id: "x" }] });
    await attendre();
    expect(vusParA).toEqual([]);
    expect(vusParB).toHaveLength(1);
    expect(vusParB[0].etat).toEqual({ grille: [{ id: "x" }] });
    expect(vusParB[0].meta.ecritPar).toBe(a.stockage().idInstance);
    expect(await b.stockage().charger()).toEqual({ grille: [{ id: "x" }] });
  });

  it("préférences, identifiant d'appareil stable", async () => {
    const [a, b] = deuxOnglets();
    await a.preferences.ecrire("vu", true);
    expect(await b.preferences.lire("vu")).toBe(true);
    const id = await a.idAppareil();
    expect(await a.idAppareil()).toBe(id);
    expect(await b.idAppareil()).toBe(id); // the same browser: the same installation
  });

  it("files d'opérations par onglet, notifiées aux autres", async () => {
    const [a, b] = deuxOnglets();
    const vus = [];
    b.operations.surChangement((idOnglet, valeur) => vus.push([idOnglet, valeur]));
    await a.operations.ecrire("ongletA", [{ idOp: 1 }]);
    await attendre();
    expect(await b.operations.toutes()).toEqual({ ongletA: [{ idOp: 1 }] });
    await a.operations.supprimer("ongletA");
    await attendre();
    expect(vus).toEqual([
      ["ongletA", [{ idOp: 1 }]],
      ["ongletA", null],
    ]);
    expect(await b.operations.toutes()).toEqual({});
  });

  it("copies de sécurité : les 3 plus récentes, de la plus récente à la plus ancienne", async () => {
    const [a] = deuxOnglets();
    for (let i = 0; i < 5; i++) {
      await a.copies.enregistrer({ n: i });
      await attendre(3);
    }
    const liste = await a.copies.lister();
    expect(liste.map((c) => c.etat.n)).toEqual([4, 3, 2]);
    await a.copies.effacerTout();
    expect(await a.copies.lister()).toEqual([]);
  });
});
