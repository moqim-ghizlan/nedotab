import { describe, expect, it } from "vitest";
import { cleUrl, domaine, normaliserUrl } from "../../src/core/url.js";

const ok = (saisie, url) =>
  it(`accepte ${JSON.stringify(saisie)}`, () =>
    expect(normaliserUrl(saisie)).toEqual({ ok: true, url }));
const ko = (saisie) =>
  it(`refuse ${JSON.stringify(saisie)}`, () => {
    const r = normaliserUrl(saisie);
    expect(r.ok).toBe(false);
    expect(r.erreur).toBeTruthy();
  });

describe("normaliserUrl", () => {
  ok("exemple.com", "https://exemple.com");
  ok(" exemple.com ", "https://exemple.com");
  ok("exemple.com/page", "https://exemple.com/page");
  ok("HTTP://Exemple.COM/", "http://exemple.com");
  ok("https://exemple.com/a?b=1#c", "https://exemple.com/a?b=1#c");
  ok("localhost:3000", "https://localhost:3000");
  ok("http://localhost", "http://localhost");
  ok("https://café.fr", "https://xn--caf-dma.fr");
  ok("www.exemple.org/", "https://www.exemple.org");
  ok("exemple.com:8080/x", "https://exemple.com:8080/x");
  ok("https://exemple.com/dossier/", "https://exemple.com/dossier/");
  ok("https://exemple.com/?q=1", "https://exemple.com/?q=1");
  ko("javascript:alert(1)");
  ko("JavaScript:alert(1)");
  ko("data:text/html,x");
  ko("file:///c:/");
  ko("chrome://settings");
  ko("chrome-extension://abc/x.html");
  ko("about:blank");
  ko("blob:https://a.com/x");
  ko("ftp://x.com");
  ko("exemple");
  ko("");
  ko("   ");
  ko("exemple .com");
  ko("https://");
});

describe("cleUrl et domaine", () => {
  it("https://www.a.com/ et http://a.com donnent la même clé", () => {
    expect(cleUrl("https://www.a.com/")).toBe(cleUrl("http://a.com"));
  });
  it("la clé garde le chemin", () => {
    expect(cleUrl("https://a.com/x")).not.toBe(cleUrl("https://a.com/y"));
  });
  it("domaine sans www", () => {
    expect(domaine("https://www.wikipedia.org/wiki")).toBe("wikipedia.org");
  });
});
