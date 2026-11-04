import { describe, expect, it } from "vitest";
import {
  configProxy,
  ECHECS_MAX,
  estDemandeDuProxy,
  estReellementActif,
  FENETRE_ECHECS_MS,
  MESSAGES,
  raisonNonControlable,
  suivreDemande,
} from "../../src/core/vpnProxy.js";

const ACCES = { domaine: "vpn.exemple.org", port: 443, compte: "u_x", motDePasse: "mdp" };

describe("configProxy", () => {
  it("proxy HTTPS du projet, adresses locales en direct", () => {
    expect(configProxy(ACCES)).toEqual({
      mode: "fixed_servers",
      rules: {
        singleProxy: { scheme: "https", host: "vpn.exemple.org", port: 443 },
        bypassList: ["<local>"],
      },
    });
  });
});

describe("contrôle du proxy", () => {
  it("n'est pas forcé si une autre extension ou une politique le contrôle", () => {
    expect(raisonNonControlable("controlled_by_other_extensions")).toBe(MESSAGES.autreExtension);
    expect(raisonNonControlable("not_controllable")).toBe(MESSAGES.politique);
    expect(raisonNonControlable("controllable_by_this_extension")).toBeNull();
    expect(raisonNonControlable("controlled_by_this_extension")).toBeNull();
  });
  it("l'état réel exige notre contrôle et le bon serveur", () => {
    const reglage = { levelOfControl: "controlled_by_this_extension", value: configProxy(ACCES) };
    expect(estReellementActif(reglage, ACCES)).toBe(true);
    const autre = { ...reglage, levelOfControl: "controlled_by_other_extensions" };
    expect(estReellementActif(autre, ACCES)).toBe(false);
    expect(estReellementActif(reglage, { ...ACCES, domaine: "autre.org" })).toBe(false);
    const systeme = { levelOfControl: "controlled_by_this_extension", value: { mode: "system" } };
    expect(estReellementActif(systeme, ACCES)).toBe(false);
    expect(estReellementActif(reglage, null)).toBe(false);
  });
});

describe("estDemandeDuProxy", () => {
  const ok = { isProxy: true, challenger: { host: "vpn.exemple.org", port: 443 } };
  it("répond au proxy du projet seulement", () => {
    expect(estDemandeDuProxy(ok, ACCES)).toBe(true);
    expect(estDemandeDuProxy({ ...ok, isProxy: false }, ACCES)).toBe(false);
    expect(estDemandeDuProxy({ ...ok, challenger: { host: "autre.org", port: 443 } }, ACCES)).toBe(
      false,
    );
    expect(
      estDemandeDuProxy({ ...ok, challenger: { host: "vpn.exemple.org.evil.org" } }, ACCES),
    ).toBe(false);
    expect(
      estDemandeDuProxy({ ...ok, challenger: { host: "vpn.exemple.org", port: 8080 } }, ACCES),
    ).toBe(false);
    expect(estDemandeDuProxy(ok, null)).toBe(false);
  });
});

describe("suivreDemande", () => {
  it("refuse après trop de demandes dans la fenêtre", () => {
    let etat = null;
    for (let i = 1; i <= ECHECS_MAX; i++) {
      const r = suivreDemande(etat, 1000 + i);
      expect(r.refuse).toBe(false);
      etat = r.etat;
    }
    expect(suivreDemande(etat, 2000).refuse).toBe(true);
  });
  it("repart de zéro quand la fenêtre est passée", () => {
    const { etat } = suivreDemande({ n: ECHECS_MAX, depuis: 0 }, FENETRE_ECHECS_MS + 1);
    expect(etat.n).toBe(1);
  });
});
