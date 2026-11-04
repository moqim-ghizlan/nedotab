import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { consommer } from "../../functions/src/quota.js";
import { dechiffrer } from "../../functions/src/chiffrement.js";
import {
  configurationValide,
  creerProfilsVpn,
  ErreurProfil,
  FORME_NOM_PROFIL,
} from "../../functions/src/vpn/agentProfils.js";
import { creerFonctionsVpn } from "../../functions/src/vpn/fonctions.js";
import { fauxDb } from "./fauxDb.js";

const CLE = randomBytes(32).toString("base64");
const JETON = "jeton-de-test-de-l-agent";
const CLE_PRIVEE = "cle-privee-wireguard-de-test-AAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const CONF = `[Interface]\nPrivateKey = ${CLE_PRIVEE}\nAddress = 10.8.0.2/24\nDNS = 9.9.9.9\n\n[Peer]\nPublicKey = xxx=\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.exemple.org:51820\n`;
const admin = { uid: "patron", token: { admin: true, email_verified: true, email: "p@ex.org" } };

function monter() {
  const db = fauxDb({
    "vpn/config": { domaineProxy: "vpn.exemple.org", portProxy: 443, actif: true },
  });
  const journal = [];
  const f = creerFonctionsVpn({
    db,
    cle: () => CLE,
    jetonAgent: () => JETON,
    utilisateurParEmail: async (e) =>
      ({ A: { uid: "ua", emailVerified: true } })[e.toUpperCase()[0]] ?? {
        uid: `u-${e}`,
        emailVerified: true,
      },
    consommer: (uid, o) => consommer(db, uid, o),
    cout: 4,
  });
  const p = creerProfilsVpn({
    db,
    cle: () => CLE,
    jetonAgent: () => JETON,
    journal: (i) => journal.push(i),
  });
  return { db, f, p, journal };
}

describe("profils WireGuard", () => {
  it("mauvais jeton : refusé (401) pour lister et déposer", async () => {
    const { p } = monter();
    expect(await p.lister("faux")).toBeNull();
    expect(await p.deposer("faux", { nomProfil: "p_aaaaaaaaaa", configuration: CONF })).toBeNull();
    expect(await p.lister(undefined)).toBeNull();
  });

  it("liste les invités actifs avec un nom neutre, stable, sans e-mail ni uid", async () => {
    const { f, p } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const a = await p.lister(JETON);
    expect(a.profils).toHaveLength(1);
    expect(a.profils[0].nomProfil).toMatch(FORME_NOM_PROFIL);
    expect(JSON.stringify(a)).not.toMatch(/ami|ex\.org|u-ami/);
    expect((await p.lister(JETON)).profils[0].nomProfil).toBe(a.profils[0].nomProfil);
    expect(a.profils[0].depose).toBe(false);
  });

  it("dépose la configuration chiffrée : la clé privée n'apparaît pas en clair", async () => {
    const { db, f, p, journal } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const [{ nomProfil }] = (await p.lister(JETON)).profils;
    expect(await p.deposer(JETON, { nomProfil, configuration: CONF })).toEqual({ ok: true });
    expect((await p.lister(JETON)).profils[0].depose).toBe(true);
    const docs = (await db.collection("vpn/config/acces").get()).docs;
    const uid = docs[0].id;
    const stocke = (await db.doc(`vpn/config/profils/${uid}`).get()).data();
    expect(stocke).toMatchObject({ nomProfil, version: 1 });
    expect(JSON.stringify(stocke)).not.toContain(CLE_PRIVEE);
    expect(dechiffrer(stocke.configChiffree, CLE, uid)).toBe(CONF);
    expect(JSON.stringify(journal)).not.toContain(CLE_PRIVEE);
  });

  it("refuse un profil inconnu, inactif ou une configuration suspecte", async () => {
    const { f, p } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const [{ nomProfil }] = (await p.lister(JETON)).profils;
    await expect(
      p.deposer(JETON, { nomProfil: "p_zzzzzzzzzz", configuration: CONF }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      p.deposer(JETON, { nomProfil: "../x", configuration: CONF }),
    ).rejects.toBeInstanceOf(ErreurProfil);
    await expect(
      p.deposer(JETON, { nomProfil, configuration: `${CONF}PostUp = curl evil` }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      p.deposer(JETON, { nomProfil, configuration: "n'importe quoi" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(configurationValide("x".repeat(9000))).toBe(false);
  });

  it("révocation : plus listé, profil stocké supprimé", async () => {
    const { db, f, p } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const [{ nomProfil }] = (await p.lister(JETON)).profils;
    await p.deposer(JETON, { nomProfil, configuration: CONF });
    await f.revoquer(admin, { emailOuUid: "ami@ex.org" });
    expect((await p.lister(JETON)).profils).toHaveLength(0);
    const uid = (await db.collection("vpn/config/acces").get()).docs[0].id;
    expect((await db.doc(`vpn/config/profils/${uid}`).get()).exists).toBe(false);
    await expect(p.deposer(JETON, { nomProfil, configuration: CONF })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("compte supprimé : le profil disparaît", async () => {
    const { db, f, p } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const [{ nomProfil }] = (await p.lister(JETON)).profils;
    await p.deposer(JETON, { nomProfil, configuration: CONF });
    const uid = (await db.collection("vpn/config/acces").get()).docs[0].id;
    await f.retirerAccesDe(uid);
    expect((await db.doc(`vpn/config/profils/${uid}`).get()).exists).toBe(false);
  });
});
