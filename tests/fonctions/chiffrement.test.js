import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chiffrer, dechiffrer, donneesAssociees } from "../../functions/src/chiffrement.js";

const secret = randomBytes(32).toString("base64");
const aad = donneesAssociees("uid-1", "openai");

describe("chiffrement des clés (AES-256-GCM)", () => {
  it("aller-retour", () => {
    const objet = chiffrer("sk-test-1234567890abcdef", secret, aad);
    expect(objet.v).toBe(1);
    expect(dechiffrer(objet, secret, aad)).toBe("sk-test-1234567890abcdef");
  });

  it("le texte chiffré ne contient pas la clé", () => {
    const objet = chiffrer("sk-test-1234567890abcdef", secret, aad);
    expect(JSON.stringify(objet)).not.toContain("sk-test");
  });

  it("IV différent à chaque chiffrement", () => {
    const a = chiffrer("même clé", secret, aad);
    const b = chiffrer("même clé", secret, aad);
    expect(a.iv).not.toBe(b.iv);
    expect(a.donnees).not.toBe(b.donnees);
    expect(Buffer.from(a.iv, "base64")).toHaveLength(12);
  });

  it("altération détectée", () => {
    const objet = chiffrer("sk-test-1234567890abcdef", secret, aad);
    const octets = Buffer.from(objet.donnees, "base64");
    octets[0] ^= 1;
    expect(() =>
      dechiffrer({ ...objet, donnees: octets.toString("base64") }, secret, aad),
    ).toThrow();
  });

  it("copiée sur un autre utilisateur ou un autre fournisseur : refusée", () => {
    const objet = chiffrer("sk-test-1234567890abcdef", secret, aad);
    expect(() => dechiffrer(objet, secret, donneesAssociees("uid-2", "openai"))).toThrow();
    expect(() => dechiffrer(objet, secret, donneesAssociees("uid-1", "gemini"))).toThrow();
  });

  it("mauvais secret ou secret absent : refusé", () => {
    const objet = chiffrer("sk-test-1234567890abcdef", secret, aad);
    expect(() => dechiffrer(objet, randomBytes(32).toString("base64"), aad)).toThrow();
    expect(() => chiffrer("x", "", aad)).toThrow(/Secret/);
  });
});
