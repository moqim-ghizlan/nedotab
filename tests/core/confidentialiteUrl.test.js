import { describe, expect, it } from "vitest";
import { analyserConfidentialite, hotePrive } from "../../src/core/confidentialiteUrl.js";

describe("hotePrive", () => {
  it.each([
    "localhost",
    "app.localhost",
    "10.0.0.5",
    "192.168.1.20",
    "172.16.0.1",
    "172.31.255.1",
    "127.0.0.1",
    "[::1]",
    "::1",
    "nas.local",
    "wiki.internal",
    "box.lan",
    "fd12:3456::1",
    "fe80::1",
  ])("%s est privé", (h) => expect(hotePrive(h)).toBe(true));
  it.each(["exemple.com", "172.32.0.1", "172.15.0.1", "8.8.8.8", "2606:4700::1111"])(
    "%s est public",
    (h) => expect(hotePrive(h)).toBe(false),
  );
});

describe("analyserConfidentialite", () => {
  it("page ordinaire : contenu lisible", () => {
    expect(analyserConfidentialite("https://exemple.com/a?page=2")).toEqual({
      contenu: true,
      url: "https://exemple.com/a?page=2",
      raison: null,
    });
  });
  it("adresse privée : pas de contenu", () => {
    expect(analyserConfidentialite("http://192.168.1.2/admin").raison).toBe("prive");
    expect(analyserConfidentialite("http://localhost:3000/").contenu).toBe(false);
  });
  it("jeton dans la requête : pas de contenu, requête retirée", () => {
    const r = analyserConfidentialite("https://exemple.com/p?token=abc&x=1#frag");
    expect(r).toEqual({ contenu: false, url: "https://exemple.com/p", raison: "jeton" });
    for (const p of ["key", "session", "auth", "code", "sig", "access_token"])
      expect(analyserConfidentialite(`https://exemple.com/?${p}=1`).raison).toBe("jeton");
  });
  it.each([
    "https://www.mabanque.fr",
    "https://webmail.exemple.com",
    "https://mail.google.com/mail",
    "https://www.ameli.fr",
    "https://www.impots.gouv.fr",
    "https://www.paypal.com/signin",
  ])("%s est sensible", (u) => expect(analyserConfidentialite(u).raison).toBe("sensible"));
  it("adresse invalide", () => {
    expect(analyserConfidentialite("pas une url").contenu).toBe(false);
  });
});
