import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { cleCache, creerCache } from "../../functions/src/cacheIa.js";
import { CONFIG_PAR_DEFAUT } from "../../functions/src/ia/config.js";
import { creerFonctionsIa } from "../../functions/src/ia/fonctions.js";
import { consommer } from "../../functions/src/quota.js";
import { creerUsage } from "../../functions/src/usage.js";
import { baseMemoire, inc } from "./baseMemoire.js";

const CLE = "sk-test-VraieCleSecrete-1234WXYZ";
const secret = randomBytes(32).toString("base64");
const config = {
  ...CONFIG_PAR_DEFAUT,
  prix: { "gemini:m": { entreeParMillion: 1, sortieParMillion: 4, devise: "USD" } },
  tauxChange: { USD: 0.5 },
  majPrix: 1_700_000_000_000,
};
let maintenant = Date.UTC(2026, 10, 21, 10); // 21 November 2026

async function monter({
  cfg = config,
  reglagesIa = { actif: true },
  textes = [],
  jetons = [1000, 500],
} = {}) {
  const db = baseMemoire();
  const file = [...textes];
  const envoyer = vi.fn(async () => ({
    texte: file.shift() ?? "Réponse",
    modele: "m",
    jetonsEntree: jetons[0],
    jetonsSortie: jetons[1],
  }));
  const ia = creerFonctionsIa({
    db,
    secret: () => secret,
    fournisseurs: {
      gemini: { formatCle: /^sk-/, verifierCle: async () => ({ valide: true }), envoyer },
    },
    config: async () => ({ ...cfg, modele: "m" }),
    consommer: (u, o) => consommer(db, u, o),
    increment: inc,
    horloge: () => maintenant,
  });
  await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
  await db.doc("users/u1").set({
    reglages: { ia: reglagesIa },
    grille: [
      { id: "a", type: "site", titre: "Marmiton", url: "https://marmiton.org", tags: ["cuisine"] },
      { id: "b", type: "site", titre: "GitHub", url: "https://github.com", tags: [] },
    ],
  });
  return { ia, db, envoyer };
}
const usage = (db, mois = "2026-11") => db.lire(`users/u1/usage/${mois}`);
const recherche = (texte) => ({ question: texte });
const JSON_RECHERCHE =
  '{"intention":"site","resultats":[{"id":"s1","score":0.9}],"aucunResultat":false}';

describe("usage enregistré (V4.19)", () => {
  it("un appel : compteurs par jour, usage, fournisseur et total ; coût estimé avec les prix de config/ia", async () => {
    const { ia, db } = await monter({ textes: [JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("cuisine"));
    // 1000 in x 1 + 500 out x 4 = 3000 / 1e6 USD = 0.003 USD x 0.5 = 0.0015 EUR
    const attendu = { appels: 1, jetonsEntree: 1000, jetonsSortie: 500, coutEstime: 0.0015 };
    const u = usage(db);
    expect(u.total).toEqual(attendu);
    expect(u.jours["21"]).toEqual(attendu);
    expect(u.parUsage.recherche).toEqual(attendu);
    expect(u.parFournisseur.gemini).toEqual(attendu);
    expect(u.sansPrix).toBeUndefined();
  });

  it("aucun contenu : ni la question, ni les titres, ni les adresses dans le document", async () => {
    const { ia, db } = await monter({ textes: [JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("secret-question-xyz"));
    const brut = JSON.stringify(usage(db));
    for (const interdit of ["secret-question-xyz", "Marmiton", "marmiton.org", "cuisine", "github"])
      expect(brut).not.toContain(interdit);
  });

  it("modèle sans prix : jetons comptés, coût 0 et « sans prix » noté", async () => {
    const { ia, db } = await monter({ cfg: { ...config, prix: {} }, textes: [JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("cuisine"));
    expect(usage(db).total).toMatchObject({ appels: 1, jetonsEntree: 1000, coutEstime: 0 });
    expect(usage(db).sansPrix).toBe(1);
  });

  it("deux appels le même jour s'additionnent ; le lendemain, un autre jour du même mois", async () => {
    const { ia, db } = await monter({ textes: [JSON_RECHERCHE, JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("cuisine"));
    maintenant += 24 * 3600 * 1000;
    await ia.rechercher("u1", recherche("dev"));
    maintenant -= 24 * 3600 * 1000;
    expect(usage(db).total.appels).toBe(2);
    expect(Object.keys(usage(db).jours).sort()).toEqual(["21", "22"]);
  });

  it("changement de mois : un nouveau document", async () => {
    const { ia, db } = await monter({ textes: [JSON_RECHERCHE] });
    maintenant = Date.UTC(2026, 11, 1, 10);
    await ia.rechercher("u1", recherche("cuisine"));
    maintenant = Date.UTC(2026, 10, 21, 10);
    expect(usage(db, "2026-12").total.appels).toBe(1);
    expect(usage(db, "2026-11")).toBeUndefined();
  });

  it("le chat en flux : jetons de la fin ; interrompu = incomplet", async () => {
    const db = baseMemoire({
      "users/u1": { reglages: { ia: { actif: true } }, grille: [] },
      "users/u1/conversations/conv-0001": {
        titre: "T",
        majLe: new Date(0),
        creeLe: new Date(0),
        nbMessages: 0,
      },
      "users/u1/conversations/conv-0001/messages/0000000000001-a": {
        role: "user",
        texte: "Bonjour",
        creeLe: new Date(1),
        etat: "ok",
      },
    });
    const flux = async function* () {
      yield { type: "texte", delta: "Salut" };
      yield { type: "erreur", code: "fournisseur-indisponible" };
    };
    const ia = creerFonctionsIa({
      db,
      secret: () => secret,
      fournisseurs: {
        gemini: {
          formatCle: /^sk-/,
          verifierCle: async () => ({ valide: true }),
          envoyer: vi.fn(),
          envoyerFlux: flux,
        },
      },
      config: async () => ({ ...config, modele: "m" }),
      consommer: (u, o) => consommer(db, u, o),
      increment: inc,
      horloge: () => maintenant,
    });
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await ia.chatFluxConversation("u1", { convId: "conv-0001" }, {});
    expect(usage(db).parUsage.chat.appels).toBe(1);
    expect(usage(db).incomplets).toBe(1);
  });
});

describe("limites personnelles", () => {
  it("par jour en appels : refus « limite-personnelle » au 3e appel, sans appel payant", async () => {
    const { ia, db, envoyer } = await monter({
      reglagesIa: { actif: true, limites: { jour: { appels: 2 } } },
      textes: Array(5).fill(JSON_RECHERCHE),
    });
    await ia.rechercher("u1", recherche("a"));
    await ia.rechercher("u1", recherche("b"));
    await expect(ia.rechercher("u1", recherche("c"))).rejects.toMatchObject({
      code: "limite-personnelle",
    });
    expect(envoyer).toHaveBeenCalledTimes(2);
    expect(db.lire("users/u1/prive/quota").appels).toBe(2); // the service quota is not consumed by the refusal
  });

  it("le lendemain, la limite du jour est remise à zéro ; celle du mois reste", async () => {
    const { ia } = await monter({
      reglagesIa: { actif: true, limites: { jour: { appels: 1 }, mois: { appels: 2 } } },
      textes: Array(5).fill(JSON_RECHERCHE),
    });
    await ia.rechercher("u1", recherche("a"));
    await expect(ia.rechercher("u1", recherche("b"))).rejects.toMatchObject({
      code: "limite-personnelle",
    });
    maintenant += 24 * 3600 * 1000;
    await ia.rechercher("u1", recherche("c"));
    await expect(ia.rechercher("u1", recherche("d"))).rejects.toMatchObject({
      code: "limite-personnelle",
    });
    maintenant -= 24 * 3600 * 1000;
  });

  it("en euros estimés", async () => {
    const { ia } = await monter({
      reglagesIa: { actif: true, limites: { jour: { euros: 0.002 } } },
      textes: Array(3).fill(JSON_RECHERCHE),
    });
    await ia.rechercher("u1", recherche("a")); // 0,0015 €
    await ia.rechercher("u1", recherche("b")); // 0,003 € in all: reached
    await expect(ia.rechercher("u1", recherche("c"))).rejects.toMatchObject({
      code: "limite-personnelle",
    });
  });

  it("limite invalide ignorée ; pas de limite : aucun refus", async () => {
    const { ia } = await monter({
      reglagesIa: { actif: true, limites: { jour: { appels: -3 }, mois: { euros: "beaucoup" } } },
      textes: Array(3).fill(JSON_RECHERCHE),
    });
    await ia.rechercher("u1", recherche("a"));
    await ia.rechercher("u1", recherche("b"));
  });
});

describe("consommation (écran)", () => {
  it("aujourd'hui, ce mois, alertes à 80 %, mois précédents", async () => {
    const { ia, db } = await monter({
      reglagesIa: { actif: true, limites: { jour: { appels: 5 } } },
      textes: Array(5).fill(JSON_RECHERCHE),
    });
    await db
      .doc("users/u1/usage/2026-10")
      .set({
        total: { appels: 7, jetonsEntree: 1, jetonsSortie: 1, coutEstime: 0.01 },
        appelsEvites: 3,
      });
    for (const q of ["a", "b", "c", "d"]) await ia.rechercher("u1", recherche(q));
    const c = await ia.consommation("u1", {});
    expect(c.aujourdhui.appels).toBe(4);
    expect(c.ceMois.total.appels).toBe(4);
    expect(c.etatLimites.atteinte).toBeNull();
    expect(c.etatLimites.alertes).toEqual([{ periode: "jour", type: "appels", pourcent: 80 }]);
    expect(c.precedents).toEqual([
      { mois: "2026-10", total: expect.objectContaining({ appels: 7 }), appelsEvites: 3 },
    ]);
    expect(c.prix.majLe).toBe(1_700_000_000_000);
  });

  it("l'usage d'un autre utilisateur n'apparaît pas", async () => {
    const { ia, db } = await monter();
    await db.doc("users/u2/usage/2026-11").set({ total: { appels: 99 } });
    expect((await ia.consommation("u1", {})).ceMois).toEqual({});
  });
});

describe("cache des réponses (V4.19)", () => {
  it("même recherche deux fois : un seul appel fournisseur, un appel évité, rien de facturé en plus", async () => {
    const { ia, db, envoyer } = await monter({ textes: [JSON_RECHERCHE, JSON_RECHERCHE] });
    const premiere = await ia.rechercher("u1", recherche("Cuisine  !"));
    const seconde = await ia.rechercher("u1", recherche("cuisine !"));
    expect(seconde).toEqual(premiere);
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(db.lire("users/u1/prive/quota").appels).toBe(1);
    expect(usage(db).appelsEvites).toBe(1);
    expect(usage(db).total.appels).toBe(1);
  });

  it("grille modifiée : nouvelle clé, nouvel appel", async () => {
    const { ia, db, envoyer } = await monter({ textes: [JSON_RECHERCHE, JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("cuisine"));
    const doc = db.lire("users/u1");
    await db
      .doc("users/u1")
      .set({
        ...doc,
        grille: [
          ...doc.grille,
          { id: "c", type: "site", titre: "Nouveau", url: "https://nouveau.fr", tags: [] },
        ],
      });
    await ia.rechercher("u1", recherche("cuisine"));
    expect(envoyer).toHaveBeenCalledTimes(2);
  });

  it("expiration à 24 h", async () => {
    const { ia, envoyer } = await monter({ textes: [JSON_RECHERCHE, JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("cuisine"));
    maintenant += 25 * 3600 * 1000;
    await ia.rechercher("u1", recherche("cuisine"));
    maintenant -= 25 * 3600 * 1000;
    expect(envoyer).toHaveBeenCalledTimes(2);
  });

  it("pas de partage entre deux utilisateurs", async () => {
    const { ia, db, envoyer } = await monter({ textes: [JSON_RECHERCHE, JSON_RECHERCHE] });
    await ia.enregistrerCle("u2", { fournisseur: "gemini", cle: CLE });
    await db
      .doc("users/u2")
      .set({ reglages: { ia: { actif: true } }, grille: db.lire("users/u1").grille });
    await ia.rechercher("u1", recherche("cuisine"));
    await ia.rechercher("u2", recherche("cuisine"));
    expect(envoyer).toHaveBeenCalledTimes(2);
  });

  it("IA désactivée : même une réponse en cache n'est pas servie", async () => {
    const { ia, db } = await monter({ textes: [JSON_RECHERCHE] });
    await ia.rechercher("u1", recherche("cuisine"));
    await db.doc("users/u1").set({ ...db.lire("users/u1"), reglages: { ia: { actif: false } } });
    await expect(ia.rechercher("u1", recherche("cuisine"))).rejects.toMatchObject({
      code: "ia-desactivee",
    });
  });

  it("tags : même page, un seul appel ; le chat n'est jamais mis en cache", async () => {
    const { ia, envoyer } = await monter({
      textes: ['{"tags":["a"],"description":"d"}', '{"tags":["b"],"description":"d"}'],
    });
    const extrait = { titre: "A" };
    const a = await ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait });
    const b = await ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait });
    expect(b).toEqual(a);
    expect(envoyer).toHaveBeenCalledTimes(1);
    const c = await ia.genererTags("u1", {
      url: "https://a.fr",
      titre: "A",
      extrait: { titre: "A", texte: "autre contenu" },
    });
    expect(c.tags).toEqual(["b"]);
  });

  it("module cache : absent, expiré, valide ; erreur de base = pas de blocage", async () => {
    const db = baseMemoire();
    let t = 1000;
    const cache = creerCache({ db, horloge: () => t });
    const cle = cleCache(["x", 1]);
    expect(await cache.lire("u1", cle)).toBeNull();
    await cache.ecrire("u1", cle, { a: 1 }, 500);
    expect(await cache.lire("u1", cle)).toEqual({ a: 1 });
    t = 1600;
    expect(await cache.lire("u1", cle)).toBeNull();
    const casse = creerCache({
      db: {
        doc: () => ({
          get: async () => {
            throw new Error("boom");
          },
          set: async () => {
            throw new Error("boom");
          },
        }),
      },
    });
    expect(await casse.lire("u1", cle)).toBeNull();
    await casse.ecrire("u1", cle, {}, 1);
    expect(cleCache(["x", 1])).toBe(cle);
    expect(cleCache(["x", 2])).not.toBe(cle);
  });
});

describe("creerUsage : jamais bloquant", () => {
  it("une erreur d'écriture ne fait pas échouer l'appel", async () => {
    const db = {
      doc: () => ({
        set: async () => {
          throw new Error("boom");
        },
        get: async () => ({ exists: false }),
      }),
    };
    const u = creerUsage({ db, config: async () => config, increment: inc });
    await expect(
      u.enregistrer("u1", { usage: "chat", fournisseur: "gemini", modele: "m" }),
    ).resolves.toBeUndefined();
    await expect(u.evite("u1")).resolves.toBeUndefined();
  });
});
