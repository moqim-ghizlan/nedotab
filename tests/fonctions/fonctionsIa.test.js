import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CONFIG_PAR_DEFAUT,
  creerLecteurConfig,
  normaliserConfig,
} from "../../functions/src/ia/config.js";
import { versErreurAppel } from "../../functions/src/ia/erreurs.js";
import { creerFonctionsIa, MESSAGE_TEST } from "../../functions/src/ia/fonctions.js";
import { ErreurFournisseur } from "../../functions/src/ia/fournisseurs/commun.js";
import { consommer, QuotaDepasse } from "../../functions/src/quota.js";
import { EntreeInvalide } from "../../functions/src/validation.js";
import { baseMemoire } from "./baseMemoire.js";

const CLE = "sk-test-VraieCleSecrete-1234WXYZ";
const secret = randomBytes(32).toString("base64");

function monter({ valide = true, reponse = "OK", limite = 300, erreurEnvoi = null } = {}) {
  const db = baseMemoire();
  const journal = vi.fn();
  const faux = {
    formatCle: /^sk-/,
    verifierCle: vi.fn(async ({ cle }) =>
      valide && cle === CLE ? { valide: true } : { valide: false, raison: "cle-invalide" },
    ),
    envoyer: vi.fn(async () => {
      if (erreurEnvoi) throw new ErreurFournisseur(erreurEnvoi);
      return { texte: reponse, jetonsEntree: 10, jetonsSortie: 1, modele: "modele-x" };
    }),
  };
  const ia = creerFonctionsIa({
    db,
    secret: () => secret,
    fournisseurs: { gemini: faux },
    config: async () => ({ ...CONFIG_PAR_DEFAUT, quotaQuotidien: limite }),
    consommer: (uid, o) => consommer(db, uid, o),
    journal,
    horloge: () => 1000,
  });
  return { db, ia, faux, journal };
}

describe("iaEnregistrerCle", () => {
  it("clé valide : enregistrée chiffrée, jamais en clair", async () => {
    const { db, ia } = monter();
    expect(await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE })).toEqual({
      fournisseur: "gemini",
      fin: "WXYZ",
      valide: true,
    });
    const doc = db.lire("users/u1/prive/ia");
    expect(doc.cles.gemini.chiffre.v).toBe(1);
    expect(doc.cles.gemini.fin).toBe("WXYZ");
    expect(db.brut()).not.toContain(CLE);
    expect(db.brut()).not.toContain("VraieCleSecrete");
  });

  it("clé refusée par le fournisseur : rien d'enregistré", async () => {
    const { db, ia } = monter({ valide: false });
    await expect(
      ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE }),
    ).rejects.toMatchObject({
      code: "cle-invalide",
    });
    expect(db.lire("users/u1/prive/ia")).toBeUndefined();
  });

  it("fournisseur absent de config/ia : refusé", async () => {
    const { ia, faux } = monter();
    await expect(
      ia.enregistrerCle("u1", { fournisseur: "mistral", cle: CLE }),
    ).rejects.toBeInstanceOf(EntreeInvalide);
    expect(faux.verifierCle).not.toHaveBeenCalled();
  });

  it.each([
    [{ fournisseur: "gemini" }, "clé manquante"],
    [{ fournisseur: "gemini", cle: "sk-court" }, "clé trop courte"],
    [{ fournisseur: "gemini", cle: "sk-avec espace dans la clé 123" }, "espace"],
    [{ fournisseur: "gemini", cle: 1234567890 }, "pas une chaîne"],
    [{ fournisseur: "gemini", cle: CLE, autre: 1 }, "paramètre en trop"],
    [{ fournisseur: "inconnu", cle: CLE }, "fournisseur inconnu"],
  ])("paramètres invalides (%s) : refusés", async (donnees) => {
    const { ia } = monter();
    await expect(ia.enregistrerCle("u1", donnees)).rejects.toBeInstanceOf(EntreeInvalide);
  });

  it("requête de plus de 200 Ko : refusée", async () => {
    const { ia } = monter();
    await expect(
      ia.enregistrerCle("u1", { fournisseur: "gemini", cle: "x".repeat(210 * 1024) }),
    ).rejects.toThrow(/volumineuse/);
  });
});

describe("iaEtatCles et iaSupprimerCle", () => {
  it("l'état ne renvoie jamais la clé ni sa forme chiffrée", async () => {
    const { ia } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    const etat = await ia.etatCles("u1", {});
    expect(etat).toEqual([{ fournisseur: "gemini", fin: "WXYZ", ajouteLe: 1000, valide: true }]);
    expect(JSON.stringify(etat)).not.toContain("chiffre");
    expect(JSON.stringify(etat)).not.toContain("VraieCle");
  });

  it("supprimer : l'état est vide", async () => {
    const { ia } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await ia.supprimerCle("u1", { fournisseur: "gemini" });
    expect(await ia.etatCles("u1", {})).toEqual([]);
  });

  it("les clés d'un utilisateur ne sont pas celles d'un autre", async () => {
    const { ia } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    expect(await ia.etatCles("u2", {})).toEqual([]);
    await expect(ia.tester("u2", { fournisseur: "gemini" })).rejects.toMatchObject({
      code: "cle-absente",
    });
  });
});

describe("iaTester", () => {
  it("appel minimal avec la clé déchiffrée, compté dans le quota", async () => {
    const { db, ia, faux } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    const r = await ia.tester("u1", { fournisseur: "gemini" });
    expect(r).toEqual({ ok: true, latenceMs: 0, modele: "modele-x" });
    expect(faux.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        cle: CLE,
        modele: CONFIG_PAR_DEFAUT.modele,
        messages: [{ role: "user", texte: MESSAGE_TEST }],
      }),
    );
    expect(db.lire("users/u1/prive/quota").appels).toBe(1);
  });

  it("quota atteint : refusé avant l'appel au fournisseur", async () => {
    const { ia, faux } = monter({ limite: 1 });
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await ia.tester("u1", { fournisseur: "gemini" });
    await expect(ia.tester("u1", { fournisseur: "gemini" })).rejects.toBeInstanceOf(QuotaDepasse);
    expect(faux.envoyer).toHaveBeenCalledTimes(1);
  });

  it("clé devenue invalide : marquée invalide", async () => {
    const { db, ia } = monter({ erreurEnvoi: "cle-invalide" });
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await expect(ia.tester("u1", { fournisseur: "gemini" })).rejects.toMatchObject({
      code: "cle-invalide",
    });
    expect(db.lire("users/u1/prive/ia").cles.gemini.valide).toBe(false);
  });

  it("le journal ne contient jamais la clé ni le message", async () => {
    const { ia, journal } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await ia.tester("u1", { fournisseur: "gemini" });
    const tout = JSON.stringify(journal.mock.calls);
    expect(journal).toHaveBeenCalled();
    expect(tout).not.toContain("VraieCle");
    expect(tout).not.toContain(MESSAGE_TEST);
  });
});

describe("erreurs vers le navigateur", () => {
  it.each([
    [new EntreeInvalide("x"), "invalid-argument", "entree-invalide"],
    [new QuotaDepasse(300), "resource-exhausted", "quota-depasse"],
    [new ErreurFournisseur("cle-invalide"), "failed-precondition", "cle-invalide"],
    [new ErreurFournisseur("cle-sans-credit"), "failed-precondition", "cle-sans-credit"],
    [new ErreurFournisseur("limite-fournisseur"), "resource-exhausted", "limite-fournisseur"],
    [new ErreurFournisseur("fournisseur-indisponible"), "unavailable", "fournisseur-indisponible"],
    [new Error("secret sk-xyz"), "internal", "interne"],
  ])("%s", (e, code, detail) => {
    const r = versErreurAppel(e);
    expect(r.code).toBe(code);
    expect(r.details.code).toBe(detail);
    expect(r.message).not.toContain("sk-xyz");
  });
});

describe("config/ia", () => {
  it("valeurs par défaut : Gemini seul, un modèle imposé, 300 appels", () => {
    const c = normaliserConfig(null);
    expect(c.quotaQuotidien).toBe(300);
    expect(c.modele).toBe("gemini-3.1-flash-lite");
    expect(c.fournisseurs.map((f) => [f.id, f.actif])).toEqual([["gemini", true]]);
  });
  it("modèle invalide dans config/ia : le modèle par défaut", () => {
    expect(normaliserConfig({ modele: "avec espace" }).modele).toBe(CONFIG_PAR_DEFAUT.modele);
    expect(normaliserConfig({ modele: "gemini-x" }).modele).toBe("gemini-x");
  });
  it("lue une fois puis gardée 5 minutes", async () => {
    let t = 0;
    const get = vi.fn(async () => ({ exists: true, data: () => ({ quotaQuotidien: 100 }) }));
    const lire = creerLecteurConfig({ doc: () => ({ get }) }, { horloge: () => t });
    expect((await lire()).quotaQuotidien).toBe(100);
    t = 4 * 60 * 1000;
    await lire();
    expect(get).toHaveBeenCalledTimes(1);
    t = 6 * 60 * 1000;
    await lire();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("executerUsage : fournisseur et modèle imposés par config/ia", () => {
  const messages = [{ role: "user", texte: "Bonjour" }];

  function avecReglages(ia) {
    const m = monter();
    m.db.doc("users/u1").set({ reglages: ia ? { ia } : {} });
    return m;
  }
  const reglagesActifs = { actif: true };

  it("utilise Gemini et le modèle imposé, quels que soient les réglages de l'utilisateur", async () => {
    const { ia, faux, db } = avecReglages({
      actif: true,
      usages: { tags: { fournisseur: "gemini", modele: "gpt-choisi" } },
    });
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    const r = await ia.executerUsage("u1", { usage: "tags", messages });
    expect(r).toMatchObject({ texte: "OK", modele: "modele-x" });
    expect(faux.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ cle: CLE, modele: CONFIG_PAR_DEFAUT.modele, messages }),
    );
    expect(db.lire("users/u1/prive/quota").appels).toBe(1);
  });

  it("un fournisseur ou un modèle envoyé par le navigateur est refusé, rien n'est appelé", async () => {
    const { ia, faux } = avecReglages(reglagesActifs);
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    for (const triche of [{ fournisseur: "gemini" }, { modele: "autre" }]) {
      await expect(
        ia.executerUsage("u1", { usage: "tags", messages, ...triche }),
      ).rejects.toBeInstanceOf(EntreeInvalide);
    }
    expect(faux.envoyer).not.toHaveBeenCalled();
  });

  it("IA désactivée, ou sans clé : refusés avant tout appel", async () => {
    const m1 = avecReglages({ actif: false });
    await expect(m1.ia.executerUsage("u1", { usage: "tags", messages })).rejects.toMatchObject({
      code: "ia-desactivee",
    });
    const m2 = avecReglages(reglagesActifs);
    await expect(m2.ia.executerUsage("u1", { usage: "tags", messages })).rejects.toMatchObject({
      code: "cle-absente",
    });
    for (const m of [m1, m2]) expect(m.faux.envoyer).not.toHaveBeenCalled();
  });

  it("usage et messages invalides : refusés", async () => {
    const { ia } = avecReglages(reglagesActifs);
    for (const d of [
      { usage: "autre", messages },
      { usage: "tags" },
      { usage: "tags", messages: [] },
      { usage: "tags", messages: [{ role: "system", texte: "x" }] },
      { usage: "tags", messages: [{ role: "user", texte: "" }] },
    ])
      await expect(ia.executerUsage("u1", d)).rejects.toBeInstanceOf(EntreeInvalide);
  });

  it("modèle retiré chez le fournisseur : code modele-introuvable, message clair", async () => {
    const m = monter({ erreurEnvoi: "modele-introuvable" });
    m.db.doc("users/u1").set({ reglages: { ia: reglagesActifs } });
    await m.ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    const e = await m.ia.executerUsage("u1", { usage: "tags", messages }).catch((x) => x);
    expect(versErreurAppel(e)).toMatchObject({
      code: "not-found",
      details: { code: "modele-introuvable" },
    });
  });

  it("le journal n'a ni la clé ni le texte des messages", async () => {
    const { ia, journal } = avecReglages(reglagesActifs);
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await ia.executerUsage("u1", { usage: "tags", messages });
    expect(JSON.stringify(journal.mock.calls)).not.toMatch(/VraieCle|Bonjour/);
  });
});

describe("genererTags (V4.4)", () => {
  const entree = { url: "https://a.fr", titre: "A", extrait: { titre: "A", texte: "texte" } };
  async function pret(reponses) {
    const m = monter();
    await m.ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await m.db.doc("users/u1").set({ reglages: { ia: { actif: true } } });
    m.faux.envoyer.mockReset();
    for (const r of reponses)
      m.faux.envoyer.mockResolvedValueOnce({ texte: r, jetonsEntree: 1, jetonsSortie: 1, modele: "m" });
    return m;
  }
  it("réponse valide", async () => {
    const m = await pret(['{"tags":["Mail"],"description":"Messagerie."}']);
    expect(await m.ia.genererTags("u1", entree)).toEqual({ tags: ["mail"], description: "Messagerie.", modele: "m" });
  });
  it("invalide puis valide : un seul nouvel essai", async () => {
    const m = await pret(["n'importe quoi", '{"tags":["a"],"description":"d"}']);
    expect((await m.ia.genererTags("u1", entree)).tags).toEqual(["a"]);
    expect(m.faux.envoyer).toHaveBeenCalledTimes(2);
  });
  it("deux fois invalide : reponse-invalide", async () => {
    const m = await pret(["x", "y"]);
    await expect(m.ia.genererTags("u1", entree)).rejects.toMatchObject({ code: "reponse-invalide" });
  });
  it("IA désactivée : aucun appel au fournisseur", async () => {
    const m = monter();
    await m.ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    m.faux.envoyer.mockClear();
    await expect(m.ia.genererTags("u1", entree)).rejects.toMatchObject({ code: "ia-desactivee" });
    expect(m.faux.envoyer).not.toHaveBeenCalled();
  });
});
