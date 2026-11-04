import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { consommer } from "../../functions/src/quota.js";
import { creerConsommationVpn } from "../../functions/src/vpn/consommation.js";
import { creerFonctionsVpn } from "../../functions/src/vpn/fonctions.js";
import { creerProfilsVpn } from "../../functions/src/vpn/agentProfils.js";
import { tacheQuotidienne } from "../../functions/src/vpn/planifie.js";
import { creerRapportVpn, rapportValide } from "../../functions/src/vpn/rapport.js";
import { GO, jourParis, joursRestants } from "../../functions/src/vpn/temps.js";
import { fauxDb } from "./fauxDb.js";

const CLE = randomBytes(32).toString("base64");
const JETON = "jeton-de-test-de-l-agent";
const NOV = Date.parse("2026-11-05T12:00:00+01:00");
const DEC = Date.parse("2026-12-01T12:00:00+01:00");
const patron = {
  uid: "patron",
  token: { admin: true, email_verified: true, email: "patron@ex.org" },
};
const de = (uid, email) => ({ uid, token: { email, email_verified: true } });

async function monter({ config = {} } = {}) {
  const horloge = { t: NOV };
  const db = fauxDb({ "vpn/config": { domaineProxy: "vpn.ex.org", actif: true, ...config } });
  const maintenant = () => horloge.t;
  const journal = [];
  const utilisateurs = { "patron@ex.org": "patron", "ami@ex.org": "ami", "autre@ex.org": "autre" };
  const f = creerFonctionsVpn({
    db,
    cle: () => CLE,
    jetonAgent: () => JETON,
    utilisateurParEmail: async (e) =>
      utilisateurs[e] ? { uid: utilisateurs[e], emailVerified: true } : null,
    consommer: (uid, o) => consommer(db, uid, o),
    maintenant,
    cout: 4,
  });
  for (const e of ["patron@ex.org", "ami@ex.org", "autre@ex.org"])
    await f.inviter(patron, { email: e });
  const p = creerProfilsVpn({ db, cle: () => CLE, jetonAgent: () => JETON });
  await p.lister(JETON); // gives each access its neutral profile name
  const acces = Object.fromEntries(
    (await db.collection("vpn/config/acces").get()).docs.map((d) => [d.id, d.data()]),
  );
  const r = creerRapportVpn({ db, jetonAgent: () => JETON, maintenant, journal: (i) => journal.push(i) });
  const c = creerConsommationVpn({ db, maintenant });
  return { db, f, r, c, p, acces, horloge, journal };
}
const rapport = (parCompte, octets = 0) => ({ parCompte, serveur: { octetsSortants: octets } });
const proxy = (compte, n) => ({ [compte]: { octetsProxy: n, octetsWireguard: 0 } });
const lire = async (db, chemin) => (await db.doc(chemin).get()).data();

describe("rapport de trafic", () => {
  it("mauvais jeton : refusé (401) ; forme invalide : refusée", async () => {
    const { r } = await monter();
    expect(await r.enregistrer("faux", rapport({}))).toBeNull();
    await expect(r.enregistrer(JETON, { parCompte: {} })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      r.enregistrer(JETON, rapport({ "../x": { octetsProxy: 1, octetsWireguard: 0 } })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(rapportValide(rapport({ u_aaaaaaaaaa: { octetsProxy: -1, octetsWireguard: 0 } }))).toBe(
      false,
    );
    expect(
      rapportValide(
        rapport({ u_aaaaaaaaaa: { octetsProxy: 1, octetsWireguard: 0, site: "x.com" } }),
      ),
    ).toBe(false);
  });

  it("incrémente par jour (proxy et WireGuard), total, et le serveur ; inconnus ignorés", async () => {
    const { r, db, acces } = await monter();
    const a = acces.ami;
    await r.enregistrer(
      JETON,
      rapport(
        {
          ...proxy(a.compte, 1000),
          [a.nomProfil]: { octetsProxy: 0, octetsWireguard: 500 },
          u_zzzzzzzzzz: { octetsProxy: 9, octetsWireguard: 0 },
        },
        2000,
      ),
    );
    await r.enregistrer(JETON, rapport(proxy(a.compte, 500), 100));
    const u = await lire(db, "vpn/config/usage/ami_2026-11");
    expect(u.jours["05"]).toEqual({ proxy: 1500, wireguard: 500 });
    expect(u.total).toBe(2000);
    expect((await lire(db, "vpn/config/serveur/2026-11")).total).toBe(2100);
  });

  it("aucun champ de destination dans les données écrites", async () => {
    const { r, db, acces } = await monter();
    await r.enregistrer(JETON, rapport(proxy(acces.ami.compte, 10), 10));
    const u = await lire(db, "vpn/config/usage/ami_2026-11");
    expect(Object.keys(u).sort()).toEqual(["jours", "total"]);
    expect(JSON.stringify(u)).not.toMatch(/url|site|host|domaine|destination|http/i);
  });

  it("80 % : alerte pour l'invité ; 100 % : coupé et exclu de la synchro", async () => {
    const { r, c, f, db, acces } = await monter();
    await c.definirLimite(patron, { email: "ami@ex.org", limiteGo: 10 });
    await r.enregistrer(JETON, rapport(proxy(acces.ami.compte, 8 * GO)));
    const m = await c.maConsommation(de("ami", "ami@ex.org"));
    expect(m).toMatchObject({ pourcent: 80, alerte: true, suspendu: null, limiteGo: 10 });
    expect((await f.synchro(JETON)).comptes.map((x) => x.compte)).toContain(acces.ami.compte);
    await r.enregistrer(JETON, rapport(proxy(acces.ami.compte, 2 * GO)));
    expect((await c.maConsommation(de("ami", "ami@ex.org"))).suspendu).toBe("limite");
    expect((await f.synchro(JETON)).comptes.map((x) => x.compte)).not.toContain(acces.ami.compte);
    expect((await lire(db, "vpn/config/acces/ami")).suspendu).toBe("limite");
  });

  it("limite illimitée (null) : jamais coupé", async () => {
    const { r, c, acces } = await monter();
    await c.definirLimite(patron, { email: "ami@ex.org", limiteGo: null });
    await r.enregistrer(JETON, rapport(proxy(acces.ami.compte, 500 * GO)));
    expect((await c.maConsommation(de("ami", "ami@ex.org"))).suspendu).toBeNull();
  });

  it("le mois suivant, la coupure pour limite est levée ; la coupure manuelle reste", async () => {
    const { r, c, db, acces, horloge } = await monter();
    await c.definirLimite(patron, { email: "ami@ex.org", limiteGo: 1 });
    await r.enregistrer(JETON, rapport(proxy(acces.ami.compte, 2 * GO)));
    await c.couper(patron, { email: "autre@ex.org" });
    expect((await tacheQuotidienne(db, () => horloge.t)).retablis).toBe(0); // même mois
    horloge.t = DEC;
    expect((await tacheQuotidienne(db, () => horloge.t)).retablis).toBe(1);
    expect((await lire(db, "vpn/config/acces/ami")).suspendu).toBeNull();
    expect((await lire(db, "vpn/config/acces/autre")).suspendu).toBe("manuel");
  });

  it("coupure de sécurité du serveur à 95 % : invités suspendus, propriétaire épargné", async () => {
    const { r, db, f, acces } = await monter({ config: { limiteServeurGo: 100 } });
    await r.enregistrer(JETON, rapport({}, 96 * GO));
    expect((await lire(db, "vpn/config/acces/ami")).suspendu).toBe("securite");
    expect((await lire(db, "vpn/config/acces/autre")).suspendu).toBe("securite");
    expect((await lire(db, "vpn/config/acces/patron")).suspendu).toBeUndefined();
    const comptes = (await f.synchro(JETON)).comptes.map((x) => x.compte);
    expect(comptes).toEqual([acces.patron.compte]);
  });

  it("coupure de sécurité désactivable", async () => {
    const { r, db } = await monter({ config: { limiteServeurGo: 100, coupureSecurite: false } });
    await r.enregistrer(JETON, rapport({}, 99 * GO));
    expect((await lire(db, "vpn/config/acces/ami")).suspendu).toBeUndefined();
  });

  it("nouveau mois : la coupure de sécurité est levée", async () => {
    const { r, db, horloge } = await monter({ config: { limiteServeurGo: 100 } });
    await r.enregistrer(JETON, rapport({}, 96 * GO));
    horloge.t = DEC;
    await tacheQuotidienne(db, () => horloge.t);
    expect((await lire(db, "vpn/config/acces/ami")).suspendu).toBeNull();
  });

  it("le profil WireGuard d'un invité coupé est désactivé, pas supprimé", async () => {
    const { c, p } = await monter();
    await c.couper(patron, { email: "ami@ex.org" });
    const profils = (await p.lister(JETON)).profils;
    expect(profils).toHaveLength(3);
    expect(profils.filter((x) => !x.actif)).toHaveLength(1);
  });

  it("conservation : les chiffres de plus de 12 mois sont supprimés", async () => {
    const { db } = await monter();
    await db.doc("vpn/config/usage/ami_2025-09").set({ total: 1, jours: {} });
    await db.doc("vpn/config/usage/ami_2025-12").set({ total: 1, jours: {} });
    await db.doc("vpn/config/serveur/2025-09").set({ total: 1, jours: {} });
    expect((await tacheQuotidienne(db, () => NOV)).supprimes).toBe(2);
    expect(await lire(db, "vpn/config/usage/ami_2025-12")).toBeDefined();
  });
});

describe("tableau du propriétaire et actions", () => {
  it("tableau : volumes par ami, état, limite ; réservé à l'administrateur", async () => {
    const { r, c, acces } = await monter();
    await r.enregistrer(JETON, rapport(proxy(acces.ami.compte, 3 * GO), 5 * GO));
    await expect(c.tableau(de("ami", "ami@ex.org"))).rejects.toMatchObject({
      code: "permission-denied",
    });
    const t = await c.tableau(patron);
    const ami = t.invites.find((i) => i.email === "ami@ex.org");
    expect(ami).toMatchObject({
      etat: "actif",
      octetsProxy: 3 * GO,
      limiteGo: 50,
      derniereActivite: "2026-11-05",
    });
    expect(t.serveur).toMatchObject({ octets: 5 * GO, limiteGo: 10000, coupureSecurite: true });
    expect(JSON.stringify(t)).not.toMatch(/motDePasse|empreinte|https?:/);
  });

  it("couper, rétablir : synchro mise à jour (version) ; invité inconnu : not-found", async () => {
    const { c, f, acces } = await monter();
    const avant = (await f.synchro(JETON)).version;
    await c.couper(patron, { email: "ami@ex.org" });
    const apres = await f.synchro(JETON);
    expect(apres.version).toBeGreaterThan(avant);
    expect(apres.comptes.map((x) => x.compte)).not.toContain(acces.ami.compte);
    expect((await c.tableau(patron)).invites.find((i) => i.email === "ami@ex.org").etat).toBe(
      "coupe",
    );
    await c.retablir(patron, { email: "ami@ex.org" });
    expect((await f.synchro(JETON)).comptes.map((x) => x.compte)).toContain(acces.ami.compte);
    await expect(c.couper(patron, { email: "inconnu@ex.org" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("limite invalide refusée ; un invité ne peut rien changer", async () => {
    const { c } = await monter();
    await expect(c.definirLimite(patron, { email: "ami@ex.org", limiteGo: 0 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    const ami = de("ami", "ami@ex.org");
    await expect(c.definirLimite(ami, { email: "ami@ex.org", limiteGo: null })).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(c.definirCoupureSecurite(ami, { active: false })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("temps : fuseau Europe/Paris et jours restants", () => {
    expect(jourParis(Date.parse("2026-11-30T23:30:00Z"))).toEqual({ mois: "2026-12", jour: "01" });
    expect(joursRestants(Date.parse("2026-11-30T12:00:00Z"))).toBe(1);
    expect(joursRestants(Date.parse("2026-11-05T12:00:00Z"))).toBe(26);
  });
});
