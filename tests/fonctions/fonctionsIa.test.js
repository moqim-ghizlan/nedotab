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
    fournisseurs: { openai: faux, gemini: faux },
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
    expect(await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE })).toEqual({
      fournisseur: "openai",
      fin: "WXYZ",
      valide: true,
    });
    const doc = db.lire("users/u1/prive/ia");
    expect(doc.cles.openai.chiffre.v).toBe(1);
    expect(doc.cles.openai.fin).toBe("WXYZ");
    expect(db.brut()).not.toContain(CLE);
    expect(db.brut()).not.toContain("VraieCleSecrete");
  });

  it("clé refusée par le fournisseur : rien d'enregistré", async () => {
    const { db, ia } = monter({ valide: false });
    await expect(
      ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE }),
    ).rejects.toMatchObject({
      code: "cle-invalide",
    });
    expect(db.lire("users/u1/prive/ia")).toBeUndefined();
  });

  it("fournisseur inactif dans config/ia (Gemini en V4.0) : refusé", async () => {
    const { ia, faux } = monter();
    await expect(
      ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE }),
    ).rejects.toBeInstanceOf(EntreeInvalide);
    expect(faux.verifierCle).not.toHaveBeenCalled();
  });

  it.each([
    [{ fournisseur: "openai" }, "clé manquante"],
    [{ fournisseur: "openai", cle: "sk-court" }, "clé trop courte"],
    [{ fournisseur: "openai", cle: "sk-avec espace dans la clé 123" }, "espace"],
    [{ fournisseur: "openai", cle: 1234567890 }, "pas une chaîne"],
    [{ fournisseur: "openai", cle: CLE, autre: 1 }, "paramètre en trop"],
    [{ fournisseur: "inconnu", cle: CLE }, "fournisseur inconnu"],
  ])("paramètres invalides (%s) : refusés", async (donnees) => {
    const { ia } = monter();
    await expect(ia.enregistrerCle("u1", donnees)).rejects.toBeInstanceOf(EntreeInvalide);
  });

  it("requête de plus de 200 Ko : refusée", async () => {
    const { ia } = monter();
    await expect(
      ia.enregistrerCle("u1", { fournisseur: "openai", cle: "x".repeat(210 * 1024) }),
    ).rejects.toThrow(/volumineuse/);
  });
});

describe("iaEtatCles et iaSupprimerCle", () => {
  it("l'état ne renvoie jamais la clé ni sa forme chiffrée", async () => {
    const { ia } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    const etat = await ia.etatCles("u1", {});
    expect(etat).toEqual([{ fournisseur: "openai", fin: "WXYZ", ajouteLe: 1000, valide: true }]);
    expect(JSON.stringify(etat)).not.toContain("chiffre");
    expect(JSON.stringify(etat)).not.toContain("VraieCle");
  });

  it("supprimer : l'état est vide", async () => {
    const { ia } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    await ia.supprimerCle("u1", { fournisseur: "openai" });
    expect(await ia.etatCles("u1", {})).toEqual([]);
  });

  it("les clés d'un utilisateur ne sont pas celles d'un autre", async () => {
    const { ia } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    expect(await ia.etatCles("u2", {})).toEqual([]);
    await expect(ia.tester("u2", { fournisseur: "openai", modele: "m" })).rejects.toMatchObject({
      code: "cle-absente",
    });
  });
});

describe("iaTester", () => {
  it("appel minimal avec la clé déchiffrée, compté dans le quota", async () => {
    const { db, ia, faux } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    const r = await ia.tester("u1", { fournisseur: "openai", modele: "modele-x" });
    expect(r).toEqual({ ok: true, latenceMs: 0, modele: "modele-x" });
    expect(faux.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        cle: CLE,
        modele: "modele-x",
        messages: [{ role: "user", texte: MESSAGE_TEST }],
      }),
    );
    expect(db.lire("users/u1/prive/quota").appels).toBe(1);
  });

  it("quota atteint : refusé avant l'appel au fournisseur", async () => {
    const { ia, faux } = monter({ limite: 1 });
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    await ia.tester("u1", { fournisseur: "openai", modele: "m" });
    await expect(ia.tester("u1", { fournisseur: "openai", modele: "m" })).rejects.toBeInstanceOf(
      QuotaDepasse,
    );
    expect(faux.envoyer).toHaveBeenCalledTimes(1);
  });

  it("clé devenue invalide : marquée invalide", async () => {
    const { db, ia } = monter({ erreurEnvoi: "cle-invalide" });
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    await expect(ia.tester("u1", { fournisseur: "openai", modele: "m" })).rejects.toMatchObject({
      code: "cle-invalide",
    });
    expect(db.lire("users/u1/prive/ia").cles.openai.valide).toBe(false);
  });

  it("nom de modèle invalide : refusé", async () => {
    const { ia } = monter();
    await expect(
      ia.tester("u1", { fournisseur: "openai", modele: "modèle avec espaces" }),
    ).rejects.toBeInstanceOf(EntreeInvalide);
  });

  it("le journal ne contient jamais la clé ni le message", async () => {
    const { ia, journal } = monter();
    await ia.enregistrerCle("u1", { fournisseur: "openai", cle: CLE });
    await ia.tester("u1", { fournisseur: "openai", modele: "m" });
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
  it("valeurs par défaut : OpenAI actif, Gemini inactif, 300 appels", () => {
    const c = normaliserConfig(null);
    expect(c.quotaQuotidien).toBe(300);
    expect(c.fournisseurs.map((f) => [f.id, f.actif])).toEqual([
      ["openai", true],
      ["gemini", false],
    ]);
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
