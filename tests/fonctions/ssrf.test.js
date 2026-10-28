import http, { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adresseInterdite } from "../../functions/src/reseau/ipInterdite.js";
import {
  ErreurPage,
  recupererPage,
  TAILLE_MAX,
} from "../../functions/src/reseau/recupererPage.js";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

describe("adresseInterdite", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.5",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "pas une ip",
  ])("%s refusée", (a) => expect(adresseInterdite(a)).toBe(true));
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])(
    "%s autorisée",
    (a) => expect(adresseInterdite(a)).toBe(false),
  );
});

// A local server stands in for the web: the test opener sends every connection to it.
let serveur;
let port;
let routes = {};
beforeAll(async () => {
  serveur = createServer((req, rep) => {
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
const html = (rep, corps = "<html><title>ok</title></html>", type = "text/html; charset=utf-8") => {
  rep.setHeader("content-type", type);
  rep.end(corps);
};
const publics = { resoudre: async () => PUBLIC, ouvrir };
const refus = (adresse, deps = {}) => expect(recupererPage(adresse, { ...publics, ...deps })).rejects;
// Private hosts are stopped by two layers (privacy rules of V4.3, then the network rules).
const INTERDIT = { code: expect.stringMatching(/^(adresse-interdite|confidentialite)$/) };
const redirige = (vers) => (_q, r) => {
  r.statusCode = 302;
  r.setHeader("location", vers);
  r.end();
};

describe("recupererPage : adresses refusées avant toute connexion", () => {
  it.each([
    "http://127.0.0.1/",
    "http://localhost/",
    "http://[::1]/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://169.254.169.254/computeMetadata/v1/",
    "http://metadata.google.internal/",
    "http://0x7f000001/",
    "http://2130706433/",
    "http://[::ffff:127.0.0.1]/",
    "ftp://exemple.fr/",
    "http://exemple.fr:8080/",
    "http://u:p@exemple.fr/",
    "http://imprimante.local/",
  ])("%s", async (a) => {
    connexions.length = 0;
    await refus(a).toMatchObject(INTERDIT);
    expect(connexions).toHaveLength(0);
  });
  it("nom public résolu vers une IP privée, ou mélange public + privé", async () => {
    await refus("http://piege.exemple.fr/", {
      resoudre: async () => [{ address: "10.0.0.1", family: 4 }],
    }).toMatchObject(INTERDIT);
    await refus("http://piege.exemple.fr/", {
      resoudre: async () => [...PUBLIC, { address: "127.0.0.1", family: 4 }],
    }).toMatchObject(INTERDIT);
  });
  it("URL sensible (V4.3) : rien n'est téléchargé", async () => {
    connexions.length = 0;
    await refus("https://www.mabanque.fr/").toMatchObject({ code: "confidentialite" });
    await refus("https://exemple.fr/p?token=abc").toMatchObject({ code: "confidentialite" });
    expect(connexions).toHaveLength(0);
  });
});

describe("recupererPage : téléchargement", () => {
  it("page normale, connexion à l'adresse vérifiée", async () => {
    routes = { "/": (_q, r) => html(r) };
    connexions.length = 0;
    const r = await recupererPage("http://exemple.fr/", publics);
    expect(r.html).toContain("<title>ok</title>");
    // The lookup given to the socket answers with the verified address, not a new resolution.
    let adresse;
    connexions[0]("autre.nom", {}, (_e, a) => (adresse = a));
    expect(adresse).toBe("93.184.216.34");
  });
  it("redirection vers 127.0.0.1 : refusée", async () => {
    routes = { "/": redirige("http://127.0.0.1/x") };
    await refus("http://exemple.fr/").toMatchObject(INTERDIT);
  });
  it("3 redirections passent, 4 sont refusées", async () => {
    routes = {
      "/": redirige("/s1"),
      "/s1": redirige("/s2"),
      "/s2": redirige("/s3"),
      "/s3": (_q, r) => html(r),
    };
    expect((await recupererPage("http://exemple.fr/", publics)).html).toContain("ok");
    routes["/s3"] = redirige("/s4");
    routes["/s4"] = (_q, r) => html(r);
    await refus("http://exemple.fr/").toMatchObject({ code: "trop-de-redirections" });
  });
  it("5 Mo : lecture coupée à 512 Ko", async () => {
    routes = { "/": (_q, r) => html(r, "a".repeat(5 * 1024 * 1024)) };
    const r = await recupererPage("http://exemple.fr/", publics);
    expect(r.html.length).toBeLessThanOrEqual(TAILLE_MAX);
  });
  it("PDF refusé", async () => {
    routes = { "/": (_q, r) => html(r, "%PDF", "application/pdf") };
    await refus("http://exemple.fr/").toMatchObject({ code: "type-invalide" });
  });
  it("serveur lent : délai dépassé", async () => {
    routes = { "/": () => {} };
    await refus("http://exemple.fr/", { delaiMs: 150 }).toMatchObject({ code: "delai-depasse" });
  });
  it("pas de cookie ni d'authentification, agent honnête", async () => {
    let entetes;
    routes = {
      "/": (q, r) => {
        entetes = q.headers;
        html(r);
      },
    };
    await recupererPage("http://exemple.fr/", publics);
    expect(entetes.cookie).toBeUndefined();
    expect(entetes.authorization).toBeUndefined();
    expect(entetes["user-agent"]).toMatch(/NedoTab/);
    expect(new ErreurPage("x").code).toBe("x");
  });
});
