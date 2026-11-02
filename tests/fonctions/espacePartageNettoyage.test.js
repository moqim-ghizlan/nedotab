import { describe, expect, it } from "vitest";
import { LOT, nettoyerEspacePartage } from "../../functions/src/espacePartage/nettoyer.js";
import { reconcilierEspacePartage } from "../../functions/src/espacePartage/reconcilier.js";

/** In-memory Firestore, just enough for the two functions (numbers stand for timestamps). */
function fauxDb(initial = {}) {
  const donnees = new Map(Object.entries(initial));
  const appliquer = (chemin, valeur, fusion) => {
    const avant = donnees.get(chemin) ?? {};
    const out = fusion ? { ...avant } : {};
    for (const [k, v] of Object.entries(valeur))
      out[k] = v && typeof v === "object" && "__incr" in v ? (avant[k] ?? 0) + v.__incr : v;
    donnees.set(chemin, out);
  };
  const ref = (chemin) => ({
    path: chemin,
    id: chemin.split("/").at(-1),
    get parent() {
      const p = chemin.split("/").slice(0, -1).join("/");
      return { id: p.split("/").at(-1), parent: { id: p.split("/").at(-2) } };
    },
    get: async () => ({ exists: donnees.has(chemin), data: () => donnees.get(chemin) }),
    set: async (v, o) => appliquer(chemin, v, o?.merge),
  });
  const snap = (chemins) => ({
    empty: chemins.length === 0,
    size: chemins.length,
    docs: chemins.map((c) => ({ id: c.split("/").at(-1), ref: ref(c), data: () => donnees.get(c) })),
  });
  const requete = (filtre) => {
    let lim = Infinity;
    let apres = null;
    const q = {
      limit: (n) => ((lim = n), q),
      orderBy: () => q,
      startAfter: (id) => ((apres = id), q),
      get: async () => {
        let cs = [...donnees.keys()].filter(filtre).sort();
        if (apres) cs = cs.filter((c) => c.split("/").at(-1) > apres);
        return snap(cs.slice(0, lim));
      },
    };
    return q;
  };
  return {
    donnees,
    doc: ref,
    batch: () => {
      const ops = [];
      return {
        delete: (r) => ops.push(() => donnees.delete(r.path)),
        set: (r, v, o) => ops.push(() => appliquer(r.path, v, o?.merge)),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    runTransaction: async (f) => f({ get: (r) => r.get(), set: (r, v) => appliquer(r.path, v) }),
    collectionGroup: () => ({
      where: (_c, _o, t) =>
        requete((c) => /^users\/[^/]+\/espacePartage\/[^/]+$/.test(c) && donnees.get(c).expireLe <= t),
    }),
    collection: (chemin) =>
      chemin === "users"
        ? requete((c) => /^users\/[^/]+$/.test(c))
        : requete((c) => c.startsWith(`${chemin}/`) && c.split("/").length === chemin.split("/").length + 1),
  };
}
const valeurs = { increment: (n) => ({ __incr: n }), timestamp: (ms) => ms };
const NOW = 1_000_000;

function stockageEspion(presents = []) {
  const supprimes = [];
  const fichiers = new Set(presents);
  const retirer = async (c) => {
    fichiers.delete(c);
    supprimes.push(c);
  };
  return {
    supprimes,
    supprimerFichier: retirer,
    supprimer: retirer,
    lister: async (uid) => [...fichiers].filter((f) => f.startsWith(`partages/${uid}/`)),
  };
}

describe("nettoyage planifié", () => {
  it("supprime les éléments expirés (fichier d'abord), garde les autres, compteurs exacts", async () => {
    const db = fauxDb({
      "users/u1/espacePartage/a": { type: "texte", expireLe: NOW - 1 },
      "users/u1/espacePartage/b": { type: "fichier", expireLe: NOW - 5, taille: 1000, chemin: "partages/u1/b/x.pdf" },
      "users/u1/espacePartage/c": { type: "texte", expireLe: NOW + 10 },
      "users/u1/espacePartageMeta/usage": { nb: 3, octets: 1000 },
    });
    const st = stockageEspion(["partages/u1/b/x.pdf"]);
    const r = await nettoyerEspacePartage({ db, stockage: st, valeurs, maintenant: () => NOW });
    expect(r).toEqual({ elements: 2, octets: 1000 });
    expect(st.supprimes).toEqual(["partages/u1/b/x.pdf"]);
    expect(db.donnees.has("users/u1/espacePartage/a")).toBe(false);
    expect(db.donnees.has("users/u1/espacePartage/c")).toBe(true);
    expect(db.donnees.get("users/u1/espacePartageMeta/usage")).toEqual({ nb: 1, octets: 0 });
  });

  it("un élément chiffré expire sans être déchiffré (seul expireLe compte)", async () => {
    const db = fauxDb({
      "users/u1/espacePartage/a": { type: "texte", chiffre: true, contenu: "v1.AAAAAAAAAAAAAAAA.xx", expireLe: NOW - 1 },
      "users/u1/espacePartageMeta/usage": { nb: 1 },
    });
    const r = await nettoyerEspacePartage({ db, stockage: stockageEspion(), valeurs, maintenant: () => NOW });
    expect(r.elements).toBe(1);
  });

  it("fichier déjà absent : pas d'erreur ; relance sans doublon", async () => {
    const db = fauxDb({
      "users/u1/espacePartage/b": { type: "fichier", expireLe: NOW - 5, taille: 10, chemin: "partages/u1/b/x" },
      "users/u1/espacePartageMeta/usage": { nb: 1, octets: 10 },
    });
    const st = stockageEspion([]);
    expect((await nettoyerEspacePartage({ db, stockage: st, valeurs, maintenant: () => NOW })).elements).toBe(1);
    expect((await nettoyerEspacePartage({ db, stockage: st, valeurs, maintenant: () => NOW })).elements).toBe(0);
    expect(db.donnees.get("users/u1/espacePartageMeta/usage")).toEqual({ nb: 0, octets: 0 });
  });

  it("traite par lots et s'arrête au budget de temps (le reste est repris ensuite)", async () => {
    const init = { "users/u1/espacePartageMeta/usage": { nb: LOT + 50 } };
    for (let i = 0; i < LOT + 50; i++)
      init[`users/u1/espacePartage/e${String(i).padStart(4, "0")}`] = { type: "texte", expireLe: NOW - 1 };
    const db = fauxDb(init);
    let t = NOW;
    const r1 = await nettoyerEspacePartage({
      db,
      stockage: stockageEspion(),
      valeurs,
      maintenant: () => (t += 100),
      budgetMs: 150,
    });
    expect(r1.elements).toBeLessThanOrEqual(LOT);
    expect(r1.elements).toBeGreaterThan(0);
    const r2 = await nettoyerEspacePartage({ db, stockage: stockageEspion(), valeurs, maintenant: () => NOW });
    expect(r1.elements + r2.elements).toBe(LOT + 50);
    expect(db.donnees.get("users/u1/espacePartageMeta/usage").nb).toBe(0);
  });

  it("deux exécutions simultanées : une seule travaille (verrou)", async () => {
    const db = fauxDb({
      "users/u1/espacePartage/a": { type: "texte", expireLe: NOW - 1 },
      "users/u1/espacePartageMeta/usage": { nb: 1 },
    });
    db.donnees.set("config/nettoyageEspacePartage", { jusqua: NOW + 60_000 });
    const r = await nettoyerEspacePartage({ db, stockage: stockageEspion(), valeurs, maintenant: () => NOW });
    expect(r).toEqual({ elements: 0, octets: 0, verrouille: true });
    expect(db.donnees.has("users/u1/espacePartage/a")).toBe(true);
  });

  it("le verrou est relâché ; le résultat journalisé ne contient que des volumes", async () => {
    const db = fauxDb({ "users/u1/espacePartage/a": { type: "texte", titre: "SECRET", expireLe: NOW - 1 } });
    const r = await nettoyerEspacePartage({ db, stockage: stockageEspion(), valeurs, maintenant: () => NOW });
    expect(db.donnees.get("config/nettoyageEspacePartage")).toEqual({ jusqua: 0 });
    expect(Object.keys(r).sort()).toEqual(["elements", "octets"]);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
});

describe("réconciliation quotidienne", () => {
  it("retire les fichiers orphelins, corrige les compteurs, signale un document sans fichier", async () => {
    const db = fauxDb({
      "users/u1": {},
      "users/u1/espacePartage/a": { type: "fichier", taille: 100, chemin: "partages/u1/a/f.pdf", expireLe: NOW + 1 },
      "users/u1/espacePartage/b": { type: "fichier", taille: 50, chemin: "partages/u1/b/manquant.pdf", expireLe: NOW + 1 },
      "users/u1/espacePartageMeta/usage": { nb: 9, octets: 9999 },
    });
    const st = stockageEspion(["partages/u1/a/f.pdf", "partages/u1/zz/orphelin.png"]);
    const r = await reconcilierEspacePartage({ db, stockage: st });
    expect(r).toEqual({ utilisateurs: 1, orphelins: 1, corriges: 1, sansFichier: 1 });
    expect(st.supprimes).toEqual(["partages/u1/zz/orphelin.png"]);
    expect(db.donnees.get("users/u1/espacePartageMeta/usage")).toEqual({ nb: 2, octets: 150 });
  });

  it("plafonnée à N utilisateurs par passage, reprise au curseur", async () => {
    const db = fauxDb({ "users/u1": {}, "users/u2": {}, "users/u3": {} });
    const st = stockageEspion();
    expect((await reconcilierEspacePartage({ db, stockage: st, max: 2 })).utilisateurs).toBe(2);
    expect((await reconcilierEspacePartage({ db, stockage: st, max: 2 })).utilisateurs).toBe(1);
    expect((await reconcilierEspacePartage({ db, stockage: st, max: 2 })).utilisateurs).toBe(2);
  });
});
