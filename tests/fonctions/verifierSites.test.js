import http, { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sonderSite } from "../../functions/src/reseau/recupererPage.js";
import { consommer } from "../../functions/src/quota.js";
import {
  classer,
  creerVerificationSites,
  IDS_PAR_APPEL_MAX,
} from "../../functions/src/sites/verifier.js";
import { baseMemoire } from "./baseMemoire.js";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

// A local server stands in for the web (same method as ssrf.test.js).
let serveur;
let port;
let routes = {};
const methodes = [];
beforeAll(async () => {
  serveur = createServer((req, rep) => {
    methodes.push(`${req.method} ${req.url}`);
    const route = routes[req.url];
    if (route) route(req, rep);
    else {
      rep.statusCode = 404;
      rep.end();
    }
  });
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  port = serveur.address().port;
});
afterAll(() => serveur.close());

const connexions = [];
const ouvrir = (_p, o) => {
  connexions.push(o.lookup);
  return http.request({ ...o, protocol: "http:", hostname: "127.0.0.1", port, lookup: undefined });
};
const publics = { resoudre: async () => PUBLIC, ouvrir };
const repondre = (statut, entetes = {}) => (_q, r) => {
  r.statusCode = statut;
  for (const [k, v] of Object.entries(entetes)) r.setHeader(k, v);
  r.end("corps qui ne doit jamais être lu");
};

describe("sonderSite : mode léger", () => {
  it("HEAD d'abord, statut renvoyé", async () => {
    routes = { "/ok": repondre(200), "/absent": repondre(404), "/panne": repondre(503) };
    methodes.length = 0;
    expect(await sonderSite("http://exemple.fr/ok", publics)).toEqual({
      statut: 200,
      urlFinale: "http://exemple.fr/ok",
    });
    expect((await sonderSite("http://exemple.fr/absent", publics)).statut).toBe(404);
    expect((await sonderSite("http://exemple.fr/panne", publics)).statut).toBe(503);
    expect(methodes.every((m) => m.startsWith("HEAD "))).toBe(true);
  });

  it("HEAD refusé (405) : repli sur GET, dont seul l'en-tête est lu", async () => {
    routes = {
      "/get": (q, r) => {
        r.statusCode = q.method === "HEAD" ? 405 : 200;
        r.end("x");
      },
    };
    methodes.length = 0;
    expect((await sonderSite("http://exemple.fr/get", publics)).statut).toBe(200);
    expect(methodes).toEqual(["HEAD /get", "GET /get"]);
  });

  it("redirections suivies à la main (3 au plus), adresse finale renvoyée", async () => {
    const vers = (l) => (_q, r) => {
      r.statusCode = 301;
      r.setHeader("location", l);
      r.end();
    };
    routes = { "/a": vers("/b"), "/b": vers("/c"), "/c": repondre(200) };
    expect(await sonderSite("http://exemple.fr/a", publics)).toEqual({
      statut: 200,
      urlFinale: "http://exemple.fr/c",
    });
    routes = { "/1": vers("/2"), "/2": vers("/3"), "/3": vers("/4"), "/4": vers("/5"), "/5": repondre(200) };
    await expect(sonderSite("http://exemple.fr/1", publics)).rejects.toMatchObject({
      code: "trop-de-redirections",
    });
  });

  it("redirection vers une adresse privée : refusée avant toute connexion", async () => {
    routes = {
      "/piege": (_q, r) => {
        r.statusCode = 302;
        r.setHeader("location", "http://169.254.169.254/");
        r.end();
      },
    };
    connexions.length = 0;
    await expect(sonderSite("http://exemple.fr/piege", publics)).rejects.toMatchObject({
      code: expect.stringMatching(/^(adresse-interdite|confidentialite)$/),
    });
    expect(connexions).toHaveLength(1); // only the first, public one
  });

  it.each([
    "http://127.0.0.1/",
    "http://localhost/",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://169.254.169.254/",
    "http://metadata.google.internal/",
    "ftp://exemple.fr/",
    "http://exemple.fr:8080/",
    "http://u:p@exemple.fr/",
  ])("%s : refusée sans connexion", async (a) => {
    connexions.length = 0;
    await expect(sonderSite(a, publics)).rejects.toMatchObject({
      code: expect.stringMatching(/^(adresse-interdite|confidentialite)$/),
    });
    expect(connexions).toHaveLength(0);
  });

  it("nom résolu vers une IP privée : refusé ; URL sensible : non vérifiée", async () => {
    await expect(
      sonderSite("http://piege.exemple.fr/", { ...publics, resoudre: async () => [{ address: "10.0.0.1", family: 4 }] }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(adresse-interdite|confidentialite)$/) });
    await expect(sonderSite("https://www.mabanque.fr/", publics)).rejects.toMatchObject({
      code: "confidentialite",
    });
  });

  it("DNS sans réponse : introuvable ; délai dépassé", async () => {
    await expect(
      sonderSite("http://nexistepas.exemple.fr/", {
        ...publics,
        resoudre: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).rejects.toMatchObject({ code: "introuvable" });
    routes = { "/lent": () => {} };
    await expect(sonderSite("http://exemple.fr/lent", { ...publics, delaiMs: 50 })).rejects.toMatchObject({
      code: "delai-depasse",
    });
  });
});

describe("classer : chaque statut", () => {
  const url = "https://exemple.fr/page";
  it.each([
    [{ statut: 200, urlFinale: url }, { statut: "ok" }],
    [{ statut: 200, urlFinale: "https://www.exemple.fr/autre" }, { statut: "ok" }],
    [{ statut: 200, urlFinale: "https://nouveau-domaine.com/" }, { statut: "redirige", urlFinale: "https://nouveau-domaine.com/" }],
    [{ statut: 404, urlFinale: url }, { statut: "introuvable", code: 404 }],
    [{ statut: 410, urlFinale: url }, { statut: "introuvable", code: 410 }],
    [{ statut: 502, urlFinale: url }, { statut: "erreur-serveur", code: 502 }],
    [{ statut: 403, urlFinale: url }, { statut: "bloque", code: 403 }],
    [{ statut: 429, urlFinale: url }, { statut: "bloque", code: 429 }],
    [{ statut: 401, urlFinale: url }, { statut: "bloque", code: 401 }],
    [{ erreur: "inaccessible" }, { statut: "injoignable" }],
    [{ erreur: "delai-depasse" }, { statut: "injoignable" }],
    [{ erreur: "introuvable" }, { statut: "injoignable" }],
    [{ erreur: "adresse-interdite" }, { statut: "non-verifiable" }],
    [{ erreur: "confidentialite" }, { statut: "non-verifiable" }],
  ])("%j", (entree, attendu) => {
    expect(classer({ url, ...entree })).toEqual(attendu);
  });
});

describe("verifierSites (fonction)", () => {
  const grille = [
    { id: "a", type: "site", titre: "A", url: "https://a.fr", tags: [] },
    { id: "b", type: "site", titre: "B", url: "https://b.fr", tags: [] },
    { id: "d", type: "dossier", titre: "D", items: [{ id: "c", type: "site", titre: "C", url: "https://c.fr", tags: [] }] },
  ];
  const monter = (reponses) => {
    const db = baseMemoire({ "users/u1": { grille } });
    const sonder = vi.fn(async (u) => {
      const r = reponses[u];
      if (r instanceof Error) throw r;
      return r;
    });
    const verifier = creerVerificationSites({
      db,
      consommer: (u, o) => consommer(db, u, o),
      sonder,
    });
    return { db, sonder, verifier };
  };

  it("lit les adresses dans la grille de l'utilisateur ; un id inconnu est ignoré", async () => {
    const { verifier, sonder } = monter({
      "https://a.fr": { statut: 200, urlFinale: "https://a.fr" },
      "https://c.fr": { statut: 404, urlFinale: "https://c.fr" },
    });
    const r = await verifier("u1", { ids: ["a", "c", "inconnu", "a"] });
    expect(r.resultats).toEqual([{ id: "a", statut: "ok" }, { id: "c", statut: "introuvable", code: 404 }]);
    expect(sonder.mock.calls.map((c) => c[0])).toEqual(["https://a.fr", "https://c.fr"]);
  });

  it("le client ne peut pas fournir d'adresse ; l'utilisateur d'un autre compte ne voit rien", async () => {
    const { verifier, sonder } = monter({});
    await expect(verifier("u1", { ids: ["a"], urls: ["http://127.0.0.1"] })).rejects.toThrow(/inconnu/);
    expect((await verifier("u2", { ids: ["a"] })).resultats).toEqual([]);
    expect(sonder).not.toHaveBeenCalled();
  });

  it("une erreur réseau d'un site ne fait pas échouer les autres", async () => {
    const { verifier } = monter({
      "https://a.fr": Object.assign(new Error("x"), { code: "delai-depasse" }),
      "https://b.fr": Object.assign(new Error("x"), { code: "adresse-interdite" }),
      "https://c.fr": { statut: 200, urlFinale: "https://c.fr" },
    });
    const r = await verifier("u1", { ids: ["a", "b", "c"] });
    expect(r.resultats.map((x) => x.statut)).toEqual(["injoignable", "non-verifiable", "ok"]);
  });

  it("au plus 50 identifiants par appel ; liste vide refusée", async () => {
    const { verifier } = monter({});
    await expect(verifier("u1", { ids: [] })).rejects.toThrow();
    await expect(
      verifier("u1", { ids: Array.from({ length: IDS_PAR_APPEL_MAX + 1 }, (_, i) => `x${i}`) }),
    ).rejects.toThrow();
  });

  it("quota de 300 vérifications par jour, séparé du quota IA", async () => {
    const { verifier, db } = monter({
      "https://a.fr": { statut: 200, urlFinale: "https://a.fr" },
    });
    await db.doc("users/u1/prive/quotaVerifs").set({
      jour: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()),
      appels: 299,
    });
    await verifier("u1", { ids: ["a"] }); // the 300th
    await expect(verifier("u1", { ids: ["a"] })).rejects.toThrow(/Limite quotidienne/);
    expect(db.lire("users/u1/prive/quota")).toBeUndefined(); // the AI quota is untouched
  });
});
