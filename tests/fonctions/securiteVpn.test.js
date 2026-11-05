import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { chiffrer, dechiffrer } from "../../functions/src/chiffrement.js";
import { consommer } from "../../functions/src/quota.js";
import { creerProfilsVpn } from "../../functions/src/vpn/agentProfils.js";
import { creerConsommationVpn } from "../../functions/src/vpn/consommation.js";
import { CHARTE_VERSION, creerFonctionsVpn } from "../../functions/src/vpn/fonctions.js";
import { empreinteCorrespond } from "../../functions/src/vpn/identifiants.js";
import { creerProfilInvite } from "../../functions/src/vpn/profil.js";
import { creerRapportVpn } from "../../functions/src/vpn/rapport.js";
import { creerRotationVpn, migrerCle } from "../../functions/src/vpn/rotation.js";
import {
  creerSurveillanceVpn,
  ECHECS_ALERTE,
  evaluer,
  sonder,
} from "../../functions/src/vpn/surveillance.js";
import { GO } from "../../functions/src/vpn/temps.js";
import { fauxDb } from "./fauxDb.js";

const CLE = randomBytes(32).toString("base64");
const JETON = "jeton-de-test-de-l-agent";
const patron = { uid: "patron", token: { admin: true, email_verified: true, email: "p@ex.org" } };
const ami = { uid: "ami", token: { email: "ami@ex.org", email_verified: true } };

function monter({ charte = false } = {}) {
  const db = fauxDb({ "vpn/config": { domaineProxy: "vpn.ex.org", portProxy: 443, actif: true } });
  const t = { v: 1_700_000_000_000 };
  const maintenant = () => t.v++;
  const f = creerFonctionsVpn({
    db,
    cle: () => CLE,
    jetonAgent: () => JETON,
    utilisateurParEmail: async (e) =>
      e === "ami@ex.org" ? { uid: "ami", emailVerified: true } : null,
    consommer: (uid, o) => consommer(db, uid, o),
    maintenant,
    cout: 4,
    charteObligatoire: charte,
  });
  return { db, f, maintenant, t };
}

describe("surveillance : évaluation", () => {
  it("trois échecs de suite : alerte, « hors ligne depuis » = premier échec ; retour : fin", () => {
    let e = evaluer({}, true, 100);
    expect(e).toMatchObject({ alerte: false, enLigneDepuis: 100 });
    e = evaluer(e, false, 200);
    e = evaluer(e, false, 300);
    expect(e.alerte).toBe(false);
    e = evaluer(e, false, 400);
    expect(e).toMatchObject({ alerte: true, echecs: ECHECS_ALERTE, horsLigneDepuis: 200 });
    e = evaluer(e, true, 500);
    expect(e).toMatchObject({
      alerte: false,
      echecs: 0,
      horsLigneDepuis: null,
      enLigneDepuis: 500,
    });
  });
  it("un échec isolé suivi d'un succès ne déclenche rien", () => {
    let e = evaluer({}, true, 1);
    e = evaluer(e, false, 2);
    e = evaluer(e, true, 3);
    expect(e).toMatchObject({ alerte: false, echecs: 0, enLigneDepuis: 1 });
  });
});

describe("surveillance : sonde TLS", () => {
  const faux = (reponse) => () => {
    const s = new EventEmitter();
    s.write = vi.fn();
    s.destroy = vi.fn();
    queueMicrotask(() => reponse(s));
    return s;
  };
  const params = { domaine: "vpn.ex.org", compte: "u_aaaaaaaaaa", motDePasse: "mdp" };

  it("200 = en ligne ; 407 = identifiants refusés ; erreur ou fermeture = hors ligne", async () => {
    expect(
      await sonder(params, {
        connecter: faux((s) =>
          s.emit("data", Buffer.from("HTTP/1.1 200 Connection established\r\n\r\n")),
        ),
      }),
    ).toMatchObject({ ok: true });
    expect(
      await sonder(params, {
        connecter: faux((s) =>
          s.emit("data", Buffer.from("HTTP/1.1 407 Proxy Authentication Required\r\n")),
        ),
      }),
    ).toMatchObject({ ok: false, code: 407 });
    expect(
      (await sonder(params, { connecter: faux((s) => s.emit("error", new Error("ECONNREFUSED"))) }))
        .ok,
    ).toBe(false);
    expect((await sonder(params, { connecter: faux((s) => s.emit("close")) })).ok).toBe(false);
  });
});

describe("surveillance : fonction planifiée", () => {
  it("rien tant que le compte technique n'existe pas ; réservé à l'administrateur", async () => {
    const { db, maintenant } = monter();
    const s = creerSurveillanceVpn({ db, cle: () => CLE, maintenant, cout: 4, sonde: vi.fn() });
    expect(await s.verifier()).toEqual({ actif: false });
    await expect(s.initialiser(ami)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("compte technique : limité à 1 Go, jamais de profil WireGuard, jamais suspendu par la sécurité", async () => {
    const { db, maintenant, f } = monter();
    await f.inviter(patron, { email: "ami@ex.org" });
    const s = creerSurveillanceVpn({ db, cle: () => CLE, maintenant, cout: 4, sonde: vi.fn() });
    await s.initialiser(patron);
    expect(await s.initialiser(patron)).toMatchObject({ dejaFait: true });
    const t = (await db.doc("vpn/config/acces/technique").get()).data();
    expect(t).toMatchObject({ technique: true, limiteMensuelleGo: 1, actif: true });
    expect(
      empreinteCorrespond(dechiffrer(t.motDePasseChiffre, CLE, "technique"), t.empreinte),
    ).toBe(true);
    const p = creerProfilsVpn({ db, cle: () => CLE, jetonAgent: () => JETON });
    expect((await p.lister(JETON)).profils).toHaveLength(1);
    const r = creerRapportVpn({ db, jetonAgent: () => JETON, maintenant });
    await db.doc("vpn/config").set({ limiteServeurGo: 100 }, { merge: true });
    await r.enregistrer(JETON, { parCompte: {}, serveur: { octetsSortants: 99 * GO } });
    expect((await db.doc("vpn/config/acces/technique").get()).data().suspendu).toBeUndefined();
    expect((await f.synchro(JETON)).comptes.map((c) => c.compte)).toContain(t.compte);
  });

  it("trois échecs : alerte visible dans l'écran du propriétaire ; retour en ligne : fin d'alerte", async () => {
    const { db, maintenant } = monter();
    const sonde = vi.fn();
    const s = creerSurveillanceVpn({ db, cle: () => CLE, maintenant, cout: 4, sonde });
    await s.initialiser(patron);
    sonde.mockResolvedValue({ ok: false, code: 0 });
    for (let i = 0; i < 2; i += 1) await s.verifier();
    expect((await s.etat()).alerte).toBe(false);
    await s.verifier();
    expect(await s.etat()).toMatchObject({ actif: true, enLigne: false, alerte: true });
    const c = creerConsommationVpn({ db, maintenant, surveillance: s });
    expect((await c.tableau(patron)).surveillance.alerte).toBe(true);
    sonde.mockResolvedValue({ ok: true, code: 200 });
    await s.verifier();
    expect(await s.etat()).toMatchObject({ enLigne: true, alerte: false });
    expect(sonde.mock.calls[0][0]).toMatchObject({
      domaine: "vpn.ex.org",
      compte: expect.stringMatching(/^u_/),
    });
  });
});

describe("charte", () => {
  it("impossible d'obtenir les identifiants sans acceptation enregistrée", async () => {
    const { f } = monter({ charte: true });
    await f.inviter(patron, { email: "ami@ex.org" });
    await expect(f.obtenirAcces(ami)).rejects.toMatchObject({
      code: "failed-precondition",
      message: "CHARTE_REQUISE",
    });
    await expect(f.accepterCharte(ami, { version: 999 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await f.accepterCharte(ami, { version: CHARTE_VERSION });
    expect((await f.obtenirAcces(ami)).compte).toMatch(/^u_/);
  });

  it("date d'acceptation enregistrée ; un non-invité ne peut pas accepter", async () => {
    const { f, db } = monter({ charte: true });
    await f.inviter(patron, { email: "ami@ex.org" });
    await f.accepterCharte(ami, { version: CHARTE_VERSION });
    const inv = (await db.collection("vpn/config/invitations").get()).docs[0].data();
    expect(inv.charte).toMatchObject({ version: CHARTE_VERSION });
    expect(inv.charte.le).toBeGreaterThan(0);
    await expect(
      f.accepterCharte(
        { uid: "x", token: { email: "inconnu@ex.org", email_verified: true } },
        { version: CHARTE_VERSION },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("le profil WireGuard exige aussi la charte", async () => {
    const { f, db } = monter({ charte: true });
    await f.inviter(patron, { email: "ami@ex.org" });
    const p = creerProfilInvite({
      db,
      cle: () => CLE,
      consommer: (u, o) => consommer(db, u, o),
      charteObligatoire: true,
    });
    await expect(p.obtenir(ami)).rejects.toMatchObject({ message: "CHARTE_REQUISE" });
    await f.accepterCharte(ami, { version: CHARTE_VERSION });
    await expect(p.obtenir(ami)).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/préparation/),
    });
  });
});

describe("rotation des secrets", () => {
  it("régénération en masse : nouveaux mots de passe valides, technique épargné, admin seulement", async () => {
    const { db, f, maintenant } = monter();
    await f.inviter(patron, { email: "ami@ex.org" });
    const avant = (await db.doc("vpn/config/acces/ami").get()).data();
    const rot = creerRotationVpn({ db, cle: () => CLE, maintenant, cout: 4 });
    await expect(rot.regenererTous(ami)).rejects.toMatchObject({ code: "permission-denied" });
    expect(await rot.regenererTous(patron)).toEqual({ ok: true, comptes: 1 });
    const apres = (await db.doc("vpn/config/acces/ami").get()).data();
    expect(apres.compte).toBe(avant.compte);
    expect(apres.empreinte).not.toBe(avant.empreinte);
    expect(
      empreinteCorrespond(dechiffrer(apres.motDePasseChiffre, CLE, "ami"), apres.empreinte),
    ).toBe(true);
  });

  it("recréation de tous les profils : marqués à recréer", async () => {
    const { db, f, maintenant } = monter();
    await f.inviter(patron, { email: "ami@ex.org" });
    const rot = creerRotationVpn({ db, cle: () => CLE, maintenant });
    expect((await rot.recreerTousProfils(patron)).profils).toBe(1);
    expect((await db.doc("vpn/config/profils/ami").get()).data().aRecreer).toBe(true);
  });

  it("migration de la clé : tout est rechiffré, l'ancienne clé ne déchiffre plus", async () => {
    const { db, f } = monter();
    await f.inviter(patron, { email: "ami@ex.org" });
    await db
      .doc("vpn/config/profils/ami")
      .set({
        nomProfil: "p_aaaaaaaaaa",
        configChiffree: chiffrer("[Interface]\nPrivateKey = K\n[Peer]\n", CLE, "ami"),
      });
    const NOUVELLE = randomBytes(32).toString("base64");
    const bilan = await migrerCle(db, CLE, NOUVELLE);
    expect(bilan).toEqual({ motsDePasse: 1, profils: 1, echecs: 0 });
    const a = (await db.doc("vpn/config/acces/ami").get()).data();
    expect(empreinteCorrespond(dechiffrer(a.motDePasseChiffre, NOUVELLE, "ami"), a.empreinte)).toBe(
      true,
    );
    expect(() => dechiffrer(a.motDePasseChiffre, CLE, "ami")).toThrow();
    const p = (await db.doc("vpn/config/profils/ami").get()).data();
    expect(dechiffrer(p.configChiffree, NOUVELLE, "ami")).toContain("PrivateKey");
  });

  it("mauvaise ancienne clé : rien n'est écrasé, échecs comptés", async () => {
    const { db, f } = monter();
    await f.inviter(patron, { email: "ami@ex.org" });
    const avant = (await db.doc("vpn/config/acces/ami").get()).data().motDePasseChiffre;
    const bilan = await migrerCle(
      db,
      randomBytes(32).toString("base64"),
      randomBytes(32).toString("base64"),
    );
    expect(bilan.echecs).toBe(1);
    expect((await db.doc("vpn/config/acces/ami").get()).data().motDePasseChiffre).toEqual(avant);
    await expect(migrerCle(db, CLE, CLE)).rejects.toThrow();
  });
});
