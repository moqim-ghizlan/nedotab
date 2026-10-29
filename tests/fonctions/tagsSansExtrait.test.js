import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CONFIG_PAR_DEFAUT } from "../../functions/src/ia/config.js";
import { creerFonctionsIa } from "../../functions/src/ia/fonctions.js";
import { ErreurPage } from "../../functions/src/reseau/recupererPage.js";
import { consommer } from "../../functions/src/quota.js";
import { baseMemoire } from "./baseMemoire.js";

const CLE = "sk-test-VraieCleSecrete-1234WXYZ";
const secret = randomBytes(32).toString("base64");
const REPONSE = {
  texte: '{"tags":["a"],"description":"d"}',
  jetonsEntree: 1,
  jetonsSortie: 1,
  modele: "m",
};

async function monter(lirePage) {
  const db = baseMemoire();
  const faux = {
    formatCle: /^sk-/,
    verifierCle: async () => ({ valide: true }),
    envoyer: vi.fn(async () => REPONSE),
  };
  const ia = creerFonctionsIa({
    db,
    secret: () => secret,
    fournisseurs: { gemini: faux },
    config: async () => CONFIG_PAR_DEFAUT,
    consommer: (u, o) => consommer(db, u, o),
    lirePage,
    horloge: () => 1000,
  });
  await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
  await db.doc("users/u1").set({ reglages: { ia: { actif: true } } });
  return { db, ia, faux };
}

describe("quotaRestant (V4.6)", () => {
  it("lit sans consommer", async () => {
    const { db, ia } = await monter(async () => null);
    const avant = await ia.quotaRestant("u1", {});
    expect(avant.restant).toBe(avant.limite);
    await ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait: { titre: "A" } });
    expect((await ia.quotaRestant("u1", {})).restant).toBe(avant.limite - 1);
    expect((await ia.quotaRestant("u1", {})).restant).toBe(avant.limite - 1);
    expect(db.lire("users/u1/prive/quota").appels).toBe(1);
  });
});

describe("genererTags sans extrait (V4.5)", () => {
  it("le serveur lit la page ; le téléchargement a son quota de 300 par jour", async () => {
    const lirePage = vi.fn(async () => ({ titre: "A", texte: "t" }));
    const { db, ia } = await monter(lirePage);
    const r = await ia.genererTags("u1", { url: "https://a.fr", titre: "A" });
    expect(r.tags).toEqual(["a"]);
    expect(lirePage).toHaveBeenCalledWith("https://a.fr");
    const quota = db.lire("users/u1/prive/quotaPages");
    expect(quota.appels).toBe(1);
    await db.doc("users/u1/prive/quotaPages").set({ jour: quota.jour, appels: 300 });
    await expect(ia.genererTags("u1", { url: "https://a.fr", titre: "A" })).rejects.toMatchObject({
      pages: true,
      message: expect.stringMatching(/lecture de pages/),
    });
  });

  it("avec un extrait (extension) : aucun téléchargement", async () => {
    const lirePage = vi.fn();
    const { ia } = await monter(lirePage);
    await ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait: { titre: "A" } });
    expect(lirePage).not.toHaveBeenCalled();
  });

  it("page refusée ou illisible : génération sur le titre et le domaine", async () => {
    const { ia, faux } = await monter(async () => {
      throw new ErreurPage("adresse-interdite");
    });
    const r = await ia.genererTags("u1", { url: "http://192.168.1.1/", titre: "Box" });
    expect(r.tags).toEqual(["a"]);
    expect(faux.envoyer.mock.calls[0][0].messages[0].texte).toContain("192.168.1.1");
  });
});

describe("limite quotidienne choisie par l'utilisateur (V4.7)", () => {
  it("la limite choisie remplace la limite par défaut, plafonnée par quotaMax", async () => {
    const { db, ia } = await monter(async () => null);
    expect((await ia.quotaRestant("u1", {})).limite).toBe(300);
    const r = await ia.definirQuota("u1", { limite: 600 });
    expect(r).toMatchObject({ limite: 600, restant: 600, max: 1000, defaut: 300 });
    await expect(ia.definirQuota("u1", { limite: 1001 })).rejects.toThrow();
    await expect(ia.definirQuota("u1", { limite: 0 })).rejects.toThrow();
    await expect(ia.definirQuota("u1", { limite: 2.5 })).rejects.toThrow();
    // an old value above a lowered ceiling is clamped
    await db.doc("users/u1/prive/reglageQuota").set({ limite: 99999 });
    expect((await ia.quotaRestant("u1", {})).limite).toBe(1000);
  });

  it("la limite choisie est appliquée aux appels", async () => {
    const { db, ia } = await monter(async () => null);
    await ia.definirQuota("u1", { limite: 2 });
    const appel = () =>
      ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait: { titre: "A" } });
    await appel();
    await appel();
    await expect(appel()).rejects.toThrow(/Limite/);
    expect(db.lire("users/u1/prive/quota").appels).toBe(2);
    await ia.definirQuota("u1", { limite: 5 });
    await appel();
  });
});
