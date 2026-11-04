import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { consommer } from "../../functions/src/quota.js";
import {
  creerFonctionsVpn,
  ErreurVpn,
  MESSAGE_RESERVE,
  QUOTA_OBTENIR_PAR_JOUR,
} from "../../functions/src/vpn/fonctions.js";
import {
  emailValide,
  empreinteBcrypt,
  empreinteCorrespond,
  genererCompte,
  genererMotDePasse,
  hashEmail,
  normaliserEmail,
  secretsEgaux,
} from "../../functions/src/vpn/identifiants.js";
import { fauxDb } from "./fauxDb.js";

const CLE = randomBytes(32).toString("base64");
const JETON = "jeton-de-test-de-l-agent";
const CONFIG = { domaineProxy: "vpn.exemple.org", portProxy: 443, pays: "Allemagne", actif: true };

const admin = { uid: "patron", token: { admin: true, email_verified: true, email: "patron@ex.org" } };
const invite = (uid, email, verifie = true) => ({
  uid,
  token: { email, email_verified: verifie },
});

function monter({ utilisateurs = {}, config = CONFIG } = {}) {
  const db = fauxDb(config ? { "vpn/config": config } : {});
  let t = 1_700_000_000_000;
  const journal = [];
  const f = creerFonctionsVpn({
    db,
    cle: () => CLE,
    jetonAgent: () => JETON,
    utilisateurParEmail: async (e) => utilisateurs[normaliserEmail(e)] ?? null,
    consommer: (uid, o) => consommer(db, uid, o),
    maintenant: () => t++,
    cout: 4, // bcrypt bon marché pour les tests
    journal: (i) => journal.push(i),
  });
  return { db, f, journal };
}

const code = (promesse) =>
  promesse.then(
    () => null,
    (e) => e.code,
  );

describe("identifiants", () => {
  it("compte, mot de passe et empreinte ont la bonne forme", () => {
    expect(genererCompte()).toMatch(/^u_[a-z0-9]{10}$/);
    const mdp = genererMotDePasse();
    expect(mdp).toHaveLength(32);
    expect(mdp).toMatch(/^[A-Za-z0-9]+$/);
    expect(genererMotDePasse()).not.toBe(mdp);
    const emp = empreinteBcrypt(mdp, 4);
    expect(emp).toMatch(/^\$2y\$04\$/);
    expect(empreinteCorrespond(mdp, emp)).toBe(true);
    expect(empreinteCorrespond("autre", emp)).toBe(false);
  });
  it("l'empreinte d'e-mail ignore la casse et les espaces", () => {
    expect(hashEmail("  Ami@Exemple.ORG ")).toBe(hashEmail("ami@exemple.org"));
    expect(hashEmail("a@ex.org")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("valide les e-mails", () => {
    expect(emailValide("ami@exemple.org")).toBe(true);
    expect(emailValide("pas-un-email")).toBe(false);
    expect(emailValide("")).toBe(false);
  });
  it("compare les secrets, jamais un secret vide", () => {
    expect(secretsEgaux("abc", "abc")).toBe(true);
    expect(secretsEgaux("abc", "abd")).toBe(false);
    expect(secretsEgaux("", "")).toBe(false);
    expect(secretsEgaux(undefined, "x")).toBe(false);
  });
});

describe("invitations", () => {
  it("un non-administrateur est refusé partout", async () => {
    const { f } = monter();
    const simple = invite("u1", "ami@ex.org");
    expect(await code(f.inviter(simple, { email: "x@ex.org" }))).toBe("permission-denied");
    expect(await code(f.revoquer(simple, { emailOuUid: "x@ex.org" }))).toBe("permission-denied");
    expect(await code(f.listeInvites(simple))).toBe("permission-denied");
  });

  it("e-mail invalide : refusé", async () => {
    const { f } = monter();
    expect(await code(f.inviter(admin, { email: "nimporte" }))).toBe("invalid-argument");
  });

  it("invitation puis connexion de l'invité : accès créé", async () => {
    const { f, db } = monter();
    expect(await f.inviter(admin, { email: "Ami@Ex.org" })).toEqual({ statut: "en_attente" });
    const a = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    expect(a).toMatchObject({ domaine: "vpn.exemple.org", port: 443, pays: "Allemagne" });
    expect(a.compte).toMatch(/^u_[a-z0-9]{10}$/);
    expect(a.motDePasse).toHaveLength(32);
    expect(db.donnees.get(`vpn/config/invitations/${hashEmail("ami@ex.org")}`).statut).toBe("acceptee");
  });

  it("un compte déjà existant et vérifié est accepté tout de suite", async () => {
    const { f } = monter({ utilisateurs: { "ami@ex.org": { uid: "u1", emailVerified: true } } });
    expect(await f.inviter(admin, { email: "ami@ex.org" })).toEqual({ statut: "acceptee" });
    const synchro = await f.synchro(JETON);
    expect(synchro.comptes).toHaveLength(1);
  });

  it("un compte existant NON vérifié reste en attente", async () => {
    const { f } = monter({ utilisateurs: { "ami@ex.org": { uid: "u1", emailVerified: false } } });
    expect(await f.inviter(admin, { email: "ami@ex.org" })).toEqual({ statut: "en_attente" });
    expect((await f.synchro(JETON)).comptes).toHaveLength(0);
  });

  it("e-mail non vérifié : refus, sans rien révéler", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const e = await f.obtenirAcces(invite("u2", "ami@ex.org", false)).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurVpn);
    expect(e.code).toBe("permission-denied");
    expect(e.message).toBe(MESSAGE_RESERVE);
    expect((await f.synchro(JETON)).comptes).toHaveLength(0);
  });

  it("un non-invité est refusé, sans connaître le serveur", async () => {
    const { f } = monter();
    const e = await f.obtenirAcces(invite("u9", "inconnu@ex.org")).catch((x) => x);
    expect(e.code).toBe("permission-denied");
    expect(e.message).toBe(MESSAGE_RESERVE);
    expect(JSON.stringify(e)).not.toContain("vpn.exemple.org");
  });

  it("le même invité retrouve le même compte et le même mot de passe", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const a = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    const b = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    expect(b).toEqual(a);
  });

  it("le VPN coupé (config.actif = false) : indisponible", async () => {
    const { f } = monter({ config: { ...CONFIG, actif: false } });
    await f.inviter(admin, { email: "ami@ex.org" });
    expect(await code(f.obtenirAcces(invite("u1", "ami@ex.org")))).toBe("failed-precondition");
  });

  it("30 demandes par jour et par utilisateur", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    for (let i = 0; i < QUOTA_OBTENIR_PAR_JOUR; i++) await f.obtenirAcces(invite("u1", "ami@ex.org"));
    expect(await code(f.obtenirAcces(invite("u1", "ami@ex.org")))).toBe("resource-exhausted");
  });
});

describe("retrait d'accès", () => {
  it("révoqué : absent de la synchro, et plus d'identifiants", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    await f.obtenirAcces(invite("u1", "ami@ex.org"));
    const avant = await f.synchro(JETON);
    expect(avant.comptes).toHaveLength(1);
    await f.revoquer(admin, { emailOuUid: "ami@ex.org" });
    const apres = await f.synchro(JETON);
    expect(apres.comptes).toHaveLength(0);
    expect(apres.version).toBeGreaterThan(avant.version);
    expect(await code(f.obtenirAcces(invite("u1", "ami@ex.org")))).toBe("permission-denied");
  });

  it("révoquer par uid fonctionne aussi", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    await f.obtenirAcces(invite("u1", "ami@ex.org"));
    await f.revoquer(admin, { emailOuUid: "u1" });
    expect((await f.synchro(JETON)).comptes).toHaveLength(0);
    expect(await code(f.obtenirAcces(invite("u1", "ami@ex.org")))).toBe("permission-denied");
  });

  it("réinviter après un retrait donne de nouveaux identifiants", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const a = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    await f.revoquer(admin, { emailOuUid: "ami@ex.org" });
    await f.inviter(admin, { email: "ami@ex.org" });
    const b = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    expect(b.compte).toBe(a.compte);
    expect(b.motDePasse).not.toBe(a.motDePasse);
    expect((await f.synchro(JETON)).comptes).toHaveLength(1);
  });

  it("compte supprimé : son accès disparaît", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    await f.obtenirAcces(invite("u1", "ami@ex.org"));
    await f.retirerAccesDe("u1");
    expect((await f.synchro(JETON)).comptes).toHaveLength(0);
    expect(await code(f.obtenirAcces(invite("u1", "ami@ex.org")))).toBe("permission-denied");
  });

  it("nouveau mot de passe : l'ancien n'est plus dans la synchro", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const a = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    const avant = (await f.synchro(JETON)).comptes[0].empreinte;
    const b = await f.regenererMotDePasse(invite("u1", "ami@ex.org"));
    const apres = (await f.synchro(JETON)).comptes[0].empreinte;
    expect(b.motDePasse).not.toBe(a.motDePasse);
    expect(empreinteCorrespond(a.motDePasse, apres)).toBe(false);
    expect(empreinteCorrespond(b.motDePasse, apres)).toBe(true);
    expect(empreinteCorrespond(a.motDePasse, avant)).toBe(true);
  });

  it("un non-invité ne peut pas régénérer", async () => {
    const { f } = monter();
    expect(await code(f.regenererMotDePasse(invite("u9", "x@ex.org")))).toBe("permission-denied");
  });
});

describe("liste des invités", () => {
  it("donne l'état, jamais un mot de passe, un compte ou une empreinte", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "a@ex.org" });
    await f.inviter(admin, { email: "b@ex.org" });
    const mdp = (await f.obtenirAcces(invite("u1", "a@ex.org"))).motDePasse;
    const { invites } = await f.listeInvites(admin);
    expect(invites.map((i) => [i.email, i.statut, i.acces]).sort()).toEqual([
      ["a@ex.org", "acceptee", true],
      ["b@ex.org", "en_attente", false],
    ]);
    const texte = JSON.stringify(invites);
    expect(texte).not.toContain(mdp);
    expect(texte).not.toMatch(/u_[a-z0-9]{10}|\$2y\$|empreinte|motDePasse/);
  });
});

describe("stockage", () => {
  it("le mot de passe est chiffré en base : la valeur claire est absente", async () => {
    const { f, db } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    const { motDePasse } = await f.obtenirAcces(invite("u1", "ami@ex.org"));
    const brut = JSON.stringify([...db.donnees.entries()]);
    expect(brut).not.toContain(motDePasse);
    expect(db.donnees.get("vpn/config/acces/u1").motDePasseChiffre).toMatchObject({ v: 1 });
  });

  it("le chiffrement est lié à l'uid (copie vers un autre compte : inutilisable)", async () => {
    const { f, db } = monter();
    await f.inviter(admin, { email: "ami@ex.org" });
    await f.obtenirAcces(invite("u1", "ami@ex.org"));
    // Copie de l'accès de u1 sous u2, avec l'invitation de u2.
    db.donnees.set("vpn/config/acces/u2", structuredClone(db.donnees.get("vpn/config/acces/u1")));
    await f.inviter(admin, { email: "autre@ex.org" });
    db.donnees.get("vpn/config/acces/u2").emailHash = hashEmail("autre@ex.org");
    db.donnees.set(`vpn/config/invitations/${hashEmail("autre@ex.org")}`, {
      email: "autre@ex.org",
      statut: "acceptee",
      uid: "u2",
    });
    expect(await f.obtenirAcces(invite("u2", "autre@ex.org")).catch(() => "echec")).toBe("echec");
  });
});

describe("agent du serveur (synchro)", () => {
  it("sans jeton ou avec un mauvais jeton : refus", async () => {
    const { f } = monter();
    expect(await f.synchro(undefined)).toBeNull();
    expect(await f.synchro("")).toBeNull();
    expect(await f.synchro("mauvais")).toBeNull();
  });

  it("bon jeton : seulement les comptes actifs, jamais un mot de passe", async () => {
    const { f, journal } = monter();
    await f.inviter(admin, { email: "a@ex.org" });
    await f.inviter(admin, { email: "b@ex.org" });
    const a = await f.obtenirAcces(invite("u1", "a@ex.org"));
    await f.obtenirAcces(invite("u2", "b@ex.org"));
    await f.revoquer(admin, { emailOuUid: "b@ex.org" });
    const s = await f.synchro(JETON);
    expect(s.comptes).toHaveLength(1);
    expect(Object.keys(s.comptes[0]).sort()).toEqual(["compte", "empreinte"]);
    expect(s.comptes[0].compte).toBe(a.compte);
    expect(JSON.stringify(s)).not.toContain(a.motDePasse);
    expect(s.version).toBeGreaterThan(0);
    // Le journal ne contient qu'un nombre de comptes.
    expect(journal.at(-1)).toEqual({ comptes: 1 });
  });

  it("la version monte à chaque changement, et reste stable sinon", async () => {
    const { f } = monter();
    await f.inviter(admin, { email: "a@ex.org" });
    await f.obtenirAcces(invite("u1", "a@ex.org"));
    const v1 = (await f.synchro(JETON)).version;
    expect((await f.synchro(JETON)).version).toBe(v1);
    await f.revoquer(admin, { emailOuUid: "a@ex.org" });
    expect((await f.synchro(JETON)).version).toBeGreaterThan(v1);
  });
});
