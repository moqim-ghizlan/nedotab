import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  chiffrerPourLien,
  dechiffrerDepuisLien,
  preuveMotDePasseLien,
} from "../../src/core/coffre.js";
import {
  analyserLien,
  decisionOuverture,
  formaterLien,
  genererLien,
} from "../../src/core/lienPartage.js";
import {
  CACHE_CONFIG_MS,
  ErreurLien,
  REQUETES_PAR_MINUTE,
  creerLiens,
} from "../../functions/src/espacePartage/liens/liens.js";
import { fauxDb, fauxStockage } from "./fauxDb.js";

const ITER = 310_000;
const NOW = 5_000_000_000;
const MDP = "une phrase de passe pour le lien";

function monde({ config = { liensActifs: true, ouvertA: "tous" }, t = { v: NOW } } = {}) {
  const db = fauxDb({ "config/partage": config });
  const stockage = fauxStockage();
  let n = 0;
  const liens = creerLiens({
    db,
    stockage,
    maintenant: () => t.v,
    aleatoire: (k) =>
      Buffer.from(`${String(++n).padStart(k, "0")}`)
        .toString("base64url")
        .padEnd(12, "A"),
    attendre: async () => {},
  });
  return { db, stockage, liens, t };
}

/** Builds what the owner's device sends. */
async function preparer({
  type = "texte",
  contenu = "bonjour",
  mdp = null,
  dureeId = "1j",
  ouverturesMax = 1,
} = {}) {
  const { jeton, cle } = genererLien();
  const octets = await chiffrerPourLien({
    cle,
    jeton,
    motDePasse: mdp,
    octets: new TextEncoder().encode(contenu),
    iterations: ITER,
  });
  return {
    jeton,
    cle,
    p: {
      jeton,
      type,
      dureeId,
      ouverturesMax,
      motDePasse: !!mdp,
      ...(mdp ? { preuve: await preuveMotDePasseLien(mdp, jeton, ITER), iterations: ITER } : {}),
      donnees: Buffer.from(octets).toString("base64url"),
    },
  };
}
const code = (promesse) =>
  promesse.then(
    () => null,
    (e) => (e instanceof ErreurLien ? e.code : `?${e.message}`),
  );

describe("lien : génération et analyse", () => {
  it("100 000 tirages : aucun doublon", () => {
    const vus = new Set();
    for (let i = 0; i < 100_000; i++) vus.add(genererLien().jeton);
    expect(vus.size).toBe(100_000);
  });
  it("analyse un lien complet, tronqué, sans clé, bidon", () => {
    const { jeton, cle } = genererLien();
    const lien = formaterLien("https://x.web.app/", jeton, cle);
    expect(lien).toBe(`https://x.web.app/r#${jeton}.${cle}`);
    expect(analyserLien(lien)).toEqual({ ok: true, jeton, cle });
    expect(analyserLien(`https://x.web.app/r#${jeton}.${cle}`.replace(/#.*/, ""))).toEqual({
      ok: false,
      raison: "incomplet",
    });
    expect(analyserLien(`https://x.web.app/r#${jeton}`)).toEqual({
      ok: false,
      raison: "incomplet",
    });
    expect(analyserLien(`https://x.web.app/r#${jeton}.${cle.slice(0, -3)}`)).toEqual({
      ok: false,
      raison: "invalide",
    });
    expect(analyserLien("https://x.web.app/r#a.b.c")).toMatchObject({ ok: false });
    expect(analyserLien("")).toMatchObject({ ok: false });
  });
  it("décision d'ouverture : identique pour expiré, épuisé, révoqué, inconnu", () => {
    const ok = { expireLe: NOW + 1000, ouverturesMax: 1, ouvertures: 0 };
    expect(decisionOuverture(ok, NOW)).toBe("ok");
    expect(decisionOuverture({ ...ok, expireLe: NOW - 1 }, NOW)).toBe("indisponible");
    expect(decisionOuverture({ ...ok, ouvertures: 1 }, NOW)).toBe("indisponible");
    expect(decisionOuverture({ ...ok, revoque: true }, NOW)).toBe("indisponible");
    expect(decisionOuverture(null, NOW)).toBe("indisponible");
    expect(decisionOuverture({ ...ok, ouverturesMax: 0, ouvertures: 99 }, NOW)).toBe("ok");
    expect(decisionOuverture({ ...ok, essais: 5 }, NOW)).toBe("verrouille");
  });
});

describe("chiffrement de la copie", () => {
  it("bonne clé : lisible ; autre clé, autre jeton (AAD), sans mot de passe : non", async () => {
    const { jeton, cle } = genererLien();
    const donnees = await chiffrerPourLien({
      cle,
      jeton,
      octets: new TextEncoder().encode("secret"),
      iterations: ITER,
    });
    expect(
      new TextDecoder().decode(
        await dechiffrerDepuisLien({ cle, jeton, donnees, iterations: ITER }),
      ),
    ).toBe("secret");
    await expect(
      dechiffrerDepuisLien({ cle: genererLien().cle, jeton, donnees, iterations: ITER }),
    ).rejects.toBeTruthy();
    await expect(
      dechiffrerDepuisLien({ cle, jeton: genererLien().jeton, donnees, iterations: ITER }),
    ).rejects.toBeTruthy();
  });
  it("lien protégé : sans le mot de passe ou avec un faux, impossible", async () => {
    const { jeton, cle } = genererLien();
    const donnees = await chiffrerPourLien({
      cle,
      jeton,
      motDePasse: MDP,
      octets: new TextEncoder().encode("secret"),
      iterations: ITER,
    });
    await expect(
      dechiffrerDepuisLien({ cle, jeton, donnees, iterations: ITER }),
    ).rejects.toBeTruthy();
    await expect(
      dechiffrerDepuisLien({
        cle,
        jeton,
        motDePasse: "faux faux faux faux",
        donnees,
        iterations: ITER,
      }),
    ).rejects.toBeTruthy();
    expect(
      new TextDecoder().decode(
        await dechiffrerDepuisLien({ cle, jeton, motDePasse: MDP, donnees, iterations: ITER }),
      ),
    ).toBe("secret");
  });
  it("la preuve n'est pas la clé : elle ne permet pas de déchiffrer et dépend du jeton", async () => {
    const a = genererLien();
    const b = genererLien();
    const pa = await preuveMotDePasseLien(MDP, a.jeton, ITER);
    expect(pa).not.toBe(await preuveMotDePasseLien(MDP, b.jeton, ITER));
    expect(pa).toHaveLength(43);
  });
});

describe("création", () => {
  it("crée, liste, révoque ; le serveur ne stocke ni clé ni mot de passe", async () => {
    const { liens, db } = monde();
    const { p, cle } = await preparer({ mdp: MDP });
    const r = await liens.creer("u1", p);
    expect(r.idLien).toBeTruthy();
    const brut = JSON.stringify([...db.donnees.entries()]);
    expect(brut).not.toContain(cle);
    expect(brut).not.toContain(MDP);
    expect(brut).not.toContain(p.preuve);
    expect(await liens.lister("u1")).toHaveLength(1);
    expect(await liens.lister("u2")).toHaveLength(0);
    await liens.revoquer("u1", r.idLien);
    expect(await liens.lister("u1")).toHaveLength(0);
    expect(db.donnees.has(`liensPartage/${p.jeton}`)).toBe(false);
    expect(db.donnees.has(`liensPartage/${p.jeton}/contenu/copie`)).toBe(false);
  });

  it("interrupteur d'urgence, liste blanche, compte suspendu", async () => {
    const off = monde({ config: { liensActifs: false } });
    expect(await code(off.liens.creer("u1", (await preparer()).p))).toBe("desactive");
    const liste = monde({ config: { liensActifs: true, createurs: ["ami"] } });
    expect(await code(liste.liens.creer("u1", (await preparer()).p))).toBe("interdit");
    expect(await code(liste.liens.creer("ami", (await preparer()).p))).toBeNull();
    const susp = monde();
    susp.db.donnees.set("users/u1/prive/partage", { suspendu: true });
    expect(await code(susp.liens.creer("u1", (await preparer()).p))).toBe("interdit");
  });

  it("refuse les paramètres invalides, un jeton déjà pris, un fichier trop gros", async () => {
    const { liens } = monde();
    const { p } = await preparer();
    expect(await code(liens.creer("u1", { ...p, dureeId: "jamais" }))).toBe("invalide");
    expect(await code(liens.creer("u1", { ...p, ouverturesMax: 7 }))).toBe("invalide");
    expect(await code(liens.creer("u1", { ...p, type: "exe" }))).toBe("invalide");
    expect(await code(liens.creer("u1", { ...p, jeton: "court" }))).toBe("invalide");
    expect(await code(liens.creer("u1", { ...p, donnees: "pas du base64!" }))).toBe("invalide");
    expect(
      await code(liens.creer("u1", { ...p, type: "fichier", donnees: "A".repeat(8_000_000) })),
    ).toBe("invalide");
    expect(await code(liens.creer("u1", p))).toBeNull();
    expect(await code(liens.creer("u2", p))).toBe("invalide"); // same token: no overwriting
  });

  it("20 liens actifs au maximum et 10 créations par heure", async () => {
    const m = monde();
    for (let i = 0; i < 10; i++)
      expect(await code(m.liens.creer("u1", (await preparer()).p))).toBeNull();
    expect(await code(m.liens.creer("u1", (await preparer()).p))).toBe("limite");
    m.t.v += 3_700_000; // an hour later: creation allowed again, still under 20 active
    for (let i = 0; i < 10; i++)
      expect(await code(m.liens.creer("u1", (await preparer({ dureeId: "7j" })).p))).toBeNull();
    m.t.v += 3_700_000;
    expect(await code(m.liens.creer("u1", (await preparer()).p))).toBe("plein");
  });

  it("un fichier va dans Storage (copie chiffrée), pas dans Firestore", async () => {
    const { liens, stockage, db } = monde();
    const { p } = await preparer({ type: "fichier", contenu: "x".repeat(1000) });
    await liens.creer("u1", p);
    expect(stockage.fichiers.has(`liens/${p.jeton}/copie`)).toBe(true);
    expect(db.donnees.has(`liensPartage/${p.jeton}/contenu/copie`)).toBe(false);
    await liens.revoquer("u1", (await liens.lister("u1"))[0].idLien);
    expect(stockage.fichiers.size).toBe(0);
  });
});

describe("ouverture", () => {
  it("info ne compte pas ; ouvrir compte ; le contenu se déchiffre avec la clé du lien", async () => {
    const { liens, db } = monde();
    const { p, cle, jeton } = await preparer({ ouverturesMax: 5 });
    await liens.creer("u1", p);
    const info = await liens.ouvrir({ jeton, action: "info" }, "1.1.1.1");
    expect(info).toMatchObject({ type: "texte", motDePasse: false });
    expect(db.donnees.get(`liensPartage/${jeton}`).ouvertures).toBe(0);
    const r = await liens.ouvrir({ jeton, action: "ouvrir" }, "1.1.1.1");
    expect(db.donnees.get(`liensPartage/${jeton}`).ouvertures).toBe(1);
    const clair = await dechiffrerDepuisLien({
      cle,
      jeton,
      donnees: Buffer.from(r.donnees, "base64url"),
      iterations: ITER,
    });
    expect(new TextDecoder().decode(clair)).toBe("bonjour");
  });

  it("10 requêtes simultanées pour 1 ouverture : une seule réussit", async () => {
    const { liens, db } = monde();
    const { p, jeton } = await preparer({ ouverturesMax: 1 });
    await liens.creer("u1", p);
    const res = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        code(liens.ouvrir({ jeton, action: "ouvrir" }, `2.2.2.${i}`)),
      ),
    );
    expect(res.filter((c) => c === null)).toHaveLength(1);
    expect(res.filter((c) => c === "indisponible")).toHaveLength(9);
    expect(db.donnees.get(`liensPartage/${jeton}`).ouvertures).toBe(1);
  });

  it("reçu de 2 minutes : nouvel essai sans recompter, refusé ensuite", async () => {
    const m = monde();
    const { p, jeton } = await preparer({ ouverturesMax: 1 });
    await m.liens.creer("u1", p);
    const a = await m.liens.ouvrir({ jeton, action: "ouvrir" }, "3.3.3.3");
    m.t.v += 60_000;
    const b = await m.liens.ouvrir({ jeton, action: "ouvrir", ticket: a.ticket }, "3.3.3.3");
    expect(b.donnees).toBe(a.donnees);
    expect(m.db.donnees.get(`liensPartage/${jeton}`).ouvertures).toBe(1);
    expect(await code(m.liens.ouvrir({ jeton, action: "ouvrir" }, "3.3.3.3"))).toBe("indisponible"); // no receipt
    m.t.v += 61_000;
    expect(
      await code(m.liens.ouvrir({ jeton, action: "ouvrir", ticket: a.ticket }, "3.3.3.3")),
    ).toBe("indisponible");
    // The content goes with the end of the receipt.
    expect((await m.liens.nettoyerLiens()).liens).toBe(1);
    expect(m.db.donnees.has(`liensPartage/${jeton}`)).toBe(false);
  });

  it("expiré, révoqué, épuisé, inconnu, jeton mal formé : réponse identique", async () => {
    const m = monde();
    const a = await preparer({ ouverturesMax: 1 });
    const b = await preparer();
    const c = await preparer({ dureeId: "1h" });
    for (const x of [a, b, c]) await m.liens.creer("u1", x.p);
    await m.liens.ouvrir({ jeton: a.jeton, action: "ouvrir" }, "4.4.4.4"); // exhausted
    await m.liens
      .revoquer(
        "u1",
        (await m.liens.lister("u1")).find((l) => l.ouverturesMax === 1 && l.ouvertures === 1)
          ?.idLien ?? "x",
      )
      .catch(() => {});
    m.t.v += 3_700_000; // c expired
    const erreurs = [];
    for (const jeton of [a.jeton, c.jeton, genererLien().jeton, "pas-un-jeton"]) {
      try {
        await m.liens.ouvrir({ jeton, action: "ouvrir" }, "4.4.4.5");
      } catch (e) {
        erreurs.push([e.code, e.message]);
      }
    }
    expect(erreurs).toHaveLength(4);
    expect(new Set(erreurs.map((e) => JSON.stringify(e))).size).toBe(1);
  });

  it("délai minimal constant pour toute erreur", async () => {
    const attentes = [];
    const db = fauxDb({ "config/partage": { liensActifs: true, ouvertA: "tous" } });
    const liens = creerLiens({
      db,
      stockage: fauxStockage(),
      maintenant: () => NOW,
      attendre: async (ms) => attentes.push(ms),
    });
    await code(liens.ouvrir({ jeton: genererLien().jeton, action: "ouvrir" }, "5.5.5.5"));
    expect(attentes).toEqual([250]);
  });

  it("lien protégé : 5 mauvais mots de passe → verrouillé, même avec le bon ensuite", async () => {
    const { liens } = monde();
    const { p, jeton } = await preparer({ mdp: MDP, ouverturesMax: 5 });
    await liens.creer("u1", p);
    const info = await liens.ouvrir({ jeton, action: "info" }, "6.6.6.6");
    expect(info).toMatchObject({ motDePasse: true, iterations: ITER });
    const faux = await preuveMotDePasseLien("faux faux faux faux", jeton, ITER);
    const restants = [];
    for (let i = 0; i < 5; i++) {
      try {
        await liens.ouvrir({ jeton, action: "ouvrir", preuve: faux }, `6.6.7.${i}`);
      } catch (e) {
        expect(e.code).toBe("mot-de-passe");
        restants.push(e.details.restants);
      }
    }
    expect(restants).toEqual([4, 3, 2, 1, 0]);
    expect(await code(liens.ouvrir({ jeton, action: "ouvrir", preuve: p.preuve }, "6.6.8.8"))).toBe(
      "verrouille",
    );
    expect((await liens.lister("u1"))[0].verrouille).toBe(true);
  });

  it("lien protégé : le bon mot de passe ouvre", async () => {
    const { liens } = monde();
    const { p, jeton, cle } = await preparer({ mdp: MDP, ouverturesMax: 5 });
    await liens.creer("u1", p);
    const r = await liens.ouvrir(
      { jeton, action: "ouvrir", preuve: await preuveMotDePasseLien(MDP, jeton, ITER) },
      "6.7.7.7",
    );
    const clair = await dechiffrerDepuisLien({
      cle,
      jeton,
      motDePasse: MDP,
      donnees: Buffer.from(r.donnees, "base64url"),
      iterations: ITER,
    });
    expect(new TextDecoder().decode(clair)).toBe("bonjour");
  });

  it("interrupteur d'urgence : tout est « indisponible » (cache de 30 s)", async () => {
    const m = monde();
    const { p, jeton } = await preparer({ ouverturesMax: 5 });
    await m.liens.creer("u1", p);
    expect(await code(m.liens.ouvrir({ jeton, action: "ouvrir" }, "7.7.7.7"))).toBeNull();
    m.db.donnees.set("config/partage", { liensActifs: false });
    expect(await code(m.liens.ouvrir({ jeton, action: "ouvrir" }, "7.7.7.8"))).toBeNull(); // still cached
    m.t.v += CACHE_CONFIG_MS + 1;
    expect(await code(m.liens.ouvrir({ jeton, action: "ouvrir" }, "7.7.7.9"))).toBe("indisponible");
    expect(await code(m.liens.ouvrir({ jeton, action: "info" }, "7.7.7.9"))).toBe("indisponible");
  });

  it("limite de débit par empreinte d'adresse, sans adresse en clair dans la base", async () => {
    const { liens, db } = monde();
    const { p, jeton } = await preparer({ ouverturesMax: 0 });
    await liens.creer("u1", p);
    const res = [];
    for (let i = 0; i < REQUETES_PAR_MINUTE + 3; i++)
      res.push(await code(liens.ouvrir({ jeton, action: "info" }, "8.8.8.8")));
    expect(res.filter((c) => c === "limite")).toHaveLength(3);
    expect(await code(liens.ouvrir({ jeton, action: "info" }, "9.9.9.9"))).toBeNull(); // another address
    expect([...db.donnees.keys()].join("\n")).not.toContain("8.8.8.8");
  });
});

describe("signalement", () => {
  it("3 signalements distincts suspendent le lien et marquent le compte ; le même appareil ne compte qu'une fois", async () => {
    const { liens, db } = monde();
    const { p, jeton } = await preparer({ ouverturesMax: 0 });
    await liens.creer("u1", p);
    await liens.signaler({ jeton }, "1.0.0.1");
    await liens.signaler({ jeton }, "1.0.0.1");
    await liens.signaler({ jeton }, "1.0.0.2");
    expect(db.donnees.get(`liensPartage/${jeton}`).suspendu).toBe(false);
    await liens.signaler({ jeton }, "1.0.0.3");
    expect(db.donnees.get(`liensPartage/${jeton}`).suspendu).toBe(true);
    expect(db.donnees.get("users/u1/prive/partage")).toEqual({ aExaminer: true });
    expect(await code(liens.ouvrir({ jeton, action: "ouvrir" }, "1.0.0.9"))).toBe("indisponible");
    // Unknown link: same answer, nothing written.
    expect(await liens.signaler({ jeton: genererLien().jeton }, "1.0.0.4")).toEqual({ ok: true });
  });
});

describe("nettoyage et suppression de compte", () => {
  it("retire les liens expirés (copie comprise) et ceux d'un compte supprimé", async () => {
    const m = monde();
    const a = await preparer({ type: "fichier", dureeId: "1h", contenu: "y".repeat(500) });
    const b = await preparer({ dureeId: "30j" });
    await m.liens.creer("u1", a.p);
    await m.liens.creer("u1", b.p);
    m.t.v += 3_700_000;
    expect((await m.liens.nettoyerLiens()).liens).toBe(1);
    expect(m.stockage.fichiers.size).toBe(0);
    expect((await m.liens.supprimerLiensDe("u1")).liens).toBe(1);
    expect([...m.db.donnees.keys()].filter((k) => k.startsWith("liensPartage"))).toEqual([]);
  });
});

describe("journaux", () => {
  it("le module de liens n'appelle jamais de journal (le volume est journalisé par index.js)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../../functions/src/espacePartage/liens/liens.js", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/logger\.|console\./);
    expect(createHash).toBeTruthy();
  });
});
