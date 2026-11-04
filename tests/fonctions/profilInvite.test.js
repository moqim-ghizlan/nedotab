import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { consommer } from "../../functions/src/quota.js";
import { chiffrer } from "../../functions/src/chiffrement.js";
import { creerProfilsVpn } from "../../functions/src/vpn/agentProfils.js";
import { creerProfilInvite, QUOTA_PROFIL_PAR_JOUR } from "../../functions/src/vpn/profil.js";
import { fauxDb } from "./fauxDb.js";

const CLE = randomBytes(32).toString("base64");
const JETON = "jeton-de-test-de-l-agent";
const PRIVEE = "CLE-PRIVEE-WG-DE-TEST-0123456789abcdefghijklmnop=";
const CONF = `[Interface]\nPrivateKey = ${PRIVEE}\nAddress = 10.8.0.2/24\n\n[Peer]\nPublicKey = xxx=\n`;
const moi = { uid: "u1", token: { email_verified: true, email: "moi@ex.org" } };

function monter({ profil = true, actif = true } = {}) {
  const donnees = {
    "vpn/config": { pays: "Allemagne" },
    "vpn/config/acces/u1": { actif, nomProfil: "p_aaaaaaaaaa" },
  };
  if (profil)
    donnees["vpn/config/profils/u1"] = {
      nomProfil: "p_aaaaaaaaaa",
      configChiffree: chiffrer(CONF, CLE, "u1"),
      version: 1,
    };
  const db = fauxDb(donnees);
  const journal = [];
  const f = creerProfilInvite({
    db,
    cle: () => CLE,
    consommer: (uid, o) => consommer(db, uid, o),
    journal: (i) => journal.push(i),
  });
  const agent = creerProfilsVpn({ db, cle: () => CLE, jetonAgent: () => JETON });
  return { db, f, journal, agent };
}
const code = (p) =>
  p.then(
    () => null,
    (e) => e.code,
  );

describe("profil WireGuard de l'invité", () => {
  it("non invité, révoqué ou e-mail non vérifié : refus", async () => {
    expect(await code(monter({ actif: false }).f.obtenir(moi))).toBe("permission-denied");
    expect(await code(monter().f.obtenir({ uid: "autre", token: { email_verified: true } }))).toBe(
      "permission-denied",
    );
    expect(await code(monter().f.obtenir({ uid: "u1", token: { email_verified: false } }))).toBe(
      "permission-denied",
    );
    expect(await code(monter().f.obtenir(undefined))).toBe("permission-denied");
  });

  it("invité : configuration déchiffrée, nom du profil et pays", async () => {
    const r = await monter().f.obtenir(moi);
    expect(r).toEqual({ config: CONF, nomProfil: "p_aaaaaaaaaa", pays: "Allemagne" });
  });

  it("profil absent : « en préparation » (failed-precondition)", async () => {
    const m = monter({ profil: false });
    await expect(m.f.obtenir(moi)).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/en préparation/),
    });
  });

  it("le journal ne contient jamais la configuration", async () => {
    const m = monter();
    await m.f.obtenir(moi);
    await m.f.recreer(moi);
    expect(JSON.stringify(m.journal)).not.toMatch(/PRIVEE|PrivateKey|Interface|u1|moi@/);
  });

  it(`quota : ${QUOTA_PROFIL_PAR_JOUR} appels par jour`, async () => {
    const m = monter();
    for (let i = 0; i < QUOTA_PROFIL_PAR_JOUR; i += 1) await m.f.obtenir(moi);
    expect(await code(m.f.obtenir(moi))).toBe("resource-exhausted");
  });

  it("recréer : le profil est marqué, plus servi, et l'agent le voit à recréer", async () => {
    const m = monter();
    await m.f.recreer(moi);
    await expect(m.f.obtenir(moi)).rejects.toMatchObject({ code: "failed-precondition" });
    const [p] = (await m.agent.lister(JETON)).profils;
    expect(p).toEqual({ nomProfil: "p_aaaaaaaaaa", depose: false, recreer: true, actif: true });
  });

  it("le nouveau dépôt de l'agent efface le marquage", async () => {
    const m = monter();
    await m.f.recreer(moi);
    await m.agent.deposer(JETON, { nomProfil: "p_aaaaaaaaaa", configuration: CONF });
    const [p] = (await m.agent.lister(JETON)).profils;
    expect(p).toEqual({ nomProfil: "p_aaaaaaaaaa", depose: true, recreer: false, actif: true });
    expect((await m.f.obtenir(moi)).config).toBe(CONF);
  });

  it("recréer par un non-invité : refus", async () => {
    expect(await code(monter({ actif: false }).f.recreer(moi))).toBe("permission-denied");
  });
});
