import { describe, expect, it } from "vitest";
import { reconcilierTodos } from "../../functions/src/todos/reconcilier.js";

/** In-memory Firestore (Admin SDK shape), just enough for the reconciliation. */
function fauxDb(initial = {}) {
  const donnees = new Map(Object.entries(initial));
  const ref = (chemin) => ({
    path: chemin,
    id: chemin.split("/").at(-1),
    get: async () => ({ exists: donnees.has(chemin), data: () => donnees.get(chemin) }),
    set: async (v, o) => donnees.set(chemin, o?.merge ? { ...(donnees.get(chemin) ?? {}), ...v } : { ...v }),
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
        cs = cs.slice(0, lim);
        return {
          empty: cs.length === 0,
          size: cs.length,
          docs: cs.map((c) => ({ id: c.split("/").at(-1), ref: ref(c), data: () => donnees.get(c) })),
        };
      },
    };
    return q;
  };
  return {
    donnees,
    doc: ref,
    collection: (chemin) =>
      requete((c) => c.startsWith(`${chemin}/`) && c.split("/").length === chemin.split("/").length + 1),
  };
}

const HEURE = 3_600_000;
const image = (uid, todo, id, taille) => ({
  id,
  chemin: `todos/${uid}/${todo}/${id}.webp`,
  taille,
  note: "SECRET",
});
const stockageEspion = (fichiers = []) => {
  const supprimes = [];
  return {
    supprimes,
    lister: async () => fichiers,
    supprimer: async (c) => void supprimes.push(c),
  };
};

describe("réconciliation des todos", () => {
  const a = "a".repeat(32);
  const b = "b".repeat(32);
  const base = () =>
    fauxDb({
      "users/u1": {},
      "users/u1/sujets/s1": { nom: "S", nbTotal: 9, nbRestants: 9 },
      "users/u1/todos/t1": { sujetId: "s1", fait: false, images: [image("u1", "t1", a, 100)] },
      "users/u1/todos/t2": { sujetId: "s1", fait: true, images: [image("u1", "t2", b, 50)] },
      "users/u1/todosMeta/usage": { nbSujets: 5, nbTodos: 5, octets: 9999 },
    });

  it("corrige les compteurs du compte et du sujet", async () => {
    const db = base();
    const st = stockageEspion([
      { nom: `todos/u1/t1/${a}.webp`, ageMs: 5 * HEURE },
      { nom: `todos/u1/t1/${a}_mini.webp`, ageMs: 5 * HEURE },
      { nom: `todos/u1/t2/${b}.webp`, ageMs: 5 * HEURE },
      { nom: `todos/u1/t2/${b}_mini.webp`, ageMs: 5 * HEURE },
    ]);
    const r = await reconcilierTodos({ db, stockage: st });
    expect(db.donnees.get("users/u1/todosMeta/usage")).toEqual({ nbSujets: 1, nbTodos: 2, octets: 150 });
    expect(db.donnees.get("users/u1/sujets/s1")).toMatchObject({ nbTotal: 2, nbRestants: 1 });
    expect(r).toMatchObject({ utilisateurs: 1, orphelins: 0, sansFichier: 0 });
    expect(st.supprimes).toEqual([]);
  });

  it("supprime un fichier orphelin ancien, garde un fichier récent et un fichier référencé", async () => {
    const db = base();
    const st = stockageEspion([
      { nom: `todos/u1/t1/${a}.webp`, ageMs: 5 * HEURE },
      { nom: "todos/u1/zz/orphelin.webp", ageMs: 5 * HEURE },
      { nom: "todos/u1/zz/recent.webp", ageMs: 60_000 },
    ]);
    const r = await reconcilierTodos({ db, stockage: st });
    expect(st.supprimes).toEqual(["todos/u1/zz/orphelin.webp"]);
    expect(r.orphelins).toBe(1);
  });

  it("signale un todo dont le fichier a disparu, sans rien supprimer", async () => {
    const db = base();
    const st = stockageEspion([{ nom: `todos/u1/t1/${a}.webp`, ageMs: 5 * HEURE }]);
    const r = await reconcilierTodos({ db, stockage: st });
    expect(r.sansFichier).toBe(1);
    expect(db.donnees.has("users/u1/todos/t2")).toBe(true);
  });

  it("ne renvoie que des volumes (ni titre, ni note, ni chemin)", async () => {
    const db = base();
    const r = await reconcilierTodos({ db, stockage: stockageEspion() });
    expect(Object.keys(r).sort()).toEqual(["corriges", "orphelins", "sansFichier", "utilisateurs"]);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });

  it("plafonnée à N utilisateurs par passage, reprise au curseur", async () => {
    const db = fauxDb({ "users/u1": {}, "users/u2": {}, "users/u3": {} });
    const st = stockageEspion();
    expect((await reconcilierTodos({ db, stockage: st, max: 2 })).utilisateurs).toBe(2);
    expect((await reconcilierTodos({ db, stockage: st, max: 2 })).utilisateurs).toBe(1);
    expect((await reconcilierTodos({ db, stockage: st, max: 2 })).utilisateurs).toBe(2);
  });

  it("un compte sans todo n'écrit rien", async () => {
    const db = fauxDb({ "users/u1": {} });
    await reconcilierTodos({ db, stockage: stockageEspion() });
    expect(db.donnees.has("users/u1/todosMeta/usage")).toBe(false);
  });
});
