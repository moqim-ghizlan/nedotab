import { describe, expect, it, vi } from "vitest";
import { CHARTE_POINTS, CHARTE_VERSION, CODE_CHARTE } from "../../src/core/vpnCharte.js";
import { creerServiceVpn } from "../../src/ui/services/vpn.js";

const exigee = Object.assign(new Error(CODE_CHARTE), { code: "functions/failed-precondition" });
const ACCES = {
  domaine: "vpn.ex.org",
  port: 443,
  compte: "u_a",
  motDePasse: "mdp",
  pays: "Allemagne",
};

function service({ accepte = true, appels = [] } = {}) {
  let acceptee = false;
  const fb = {
    appelerVpn: vi.fn(async (nom, donnees) => {
      appels.push([nom, donnees]);
      if (nom === "vpnAccepterCharte") {
        acceptee = true;
        return { ok: true };
      }
      if (!acceptee) throw exigee;
      return ACCES;
    }),
  };
  const demanderCharte = vi.fn(async () => accepte);
  return { s: creerServiceVpn({ chargerFb: async () => fb, demanderCharte }), fb, demanderCharte };
}

describe("charte côté invité", () => {
  it("texte : 5 engagements du plan + la mise en garde « pas anonyme »", () => {
    const t = CHARTE_POINTS.join(" ");
    expect(t).toMatch(/sans aucune garantie/);
    expect(t).toMatch(/illégale/);
    expect(t).toMatch(/volume de données/);
    expect(t).toMatch(/retiré à tout moment/);
    expect(t).toMatch(/Ne partagez ni vos identifiants/);
    expect(t).toMatch(/ne vous rend pas anonyme/);
  });

  it("acceptée : enregistrée avec la version affichée, puis les identifiants arrivent", async () => {
    const appels = [];
    const { s, demanderCharte } = service({ appels });
    const r = await s.acces();
    expect(demanderCharte).toHaveBeenCalledTimes(1);
    expect(appels.map(([n]) => n)).toEqual([
      "vpnObtenirAcces",
      "vpnAccepterCharte",
      "vpnObtenirAcces",
    ]);
    expect(appels[1][1]).toEqual({ version: CHARTE_VERSION });
    expect(r).toMatchObject({ ok: true, valeur: { compte: "u_a" } });
  });

  it("refusée : rien n'est enregistré, aucun identifiant n'est donné", async () => {
    const appels = [];
    const { s } = service({ accepte: false, appels });
    const r = await s.acces();
    expect(r).toMatchObject({ ok: false, code: "charte" });
    expect(r.erreur).toMatch(/accepter la charte/);
    expect(appels.map(([n]) => n)).toEqual(["vpnObtenirAcces"]);
  });

  it("déjà acceptée : la charte n'est pas redemandée", async () => {
    const { s, demanderCharte } = service();
    await s.acces();
    await s.acces();
    expect(demanderCharte).toHaveBeenCalledTimes(1);
  });
});
