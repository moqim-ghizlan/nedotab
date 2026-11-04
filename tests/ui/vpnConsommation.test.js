import { beforeEach, describe, expect, it, vi } from "vitest";

const demander = vi.fn();
vi.mock("../../src/ui/dialogues/commun.js", () => ({ demander: (...a) => demander(...a) }));
vi.mock("../../src/ui/toast.js", () => ({ toast: vi.fn() }));

import {
  formaterOctets,
  jourCourt,
  lireConsommation,
  messageAlerte,
  phraseConsommation,
} from "../../src/core/vpnConsommation.js";
import { blocConsommation } from "../../src/ui/reglages/vpnConsommation.js";
import { blocTableauInvites } from "../../src/ui/reglages/vpnInvites.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
const texte = () => document.body.textContent;
const bouton = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent === t);

beforeEach(() => {
  document.body.replaceChildren();
  demander.mockReset();
});

describe("aides de consommation", () => {
  it("formate les volumes en Mo, Go, To (décimal, virgule)", () => {
    expect(formaterOctets(12_400_000_000)).toBe("12,4 Go");
    expect(formaterOctets(3_200_000)).toBe("3,2 Mo");
    expect(formaterOctets(2e12)).toBe("2 To");
    expect(formaterOctets(-5)).toBe("0 Mo");
    expect(formaterOctets(undefined)).toBe("0 Mo");
  });
  it("phrase « Ce mois-ci : 12,4 Go sur 50 Go » et messages", () => {
    const c = lireConsommation({
      octets: 12.4e9,
      limiteGo: 50,
      pourcent: 25,
      alerte: false,
      suspendu: null,
      joursRestants: 3,
      x: 1,
    });
    expect(phraseConsommation(c)).toBe("Ce mois-ci : 12,4 Go sur 50 Go");
    expect(phraseConsommation({ ...c, limiteGo: null })).toContain("sans limite");
    expect(messageAlerte(c)).toBeNull();
    expect(messageAlerte({ ...c, alerte: true })).toMatch(/80 %/);
    expect(messageAlerte({ ...c, suspendu: "limite" })).toMatch(/limite mensuelle est atteinte/);
    expect(lireConsommation({ octets: "beaucoup" })).toBeNull();
  });
  it("dernière activité : le jour seulement", () => {
    expect(jourCourt("2026-11-05")).toBe("05/11");
    expect(jourCourt("2026-11-05T12:30:00")).toBe("—");
    expect(jourCourt(null)).toBe("—");
  });
});

describe("écran invité", () => {
  it("affiche le volume, la barre, le message d'alerte et la phrase de confidentialité", async () => {
    const service = {
      consommation: vi.fn(async () => ({
        ok: true,
        valeur: {
          octets: 41e9,
          limiteGo: 50,
          pourcent: 82,
          alerte: true,
          suspendu: null,
          joursRestants: 7,
        },
      })),
    };
    document.body.append(blocConsommation({ service }).racine);
    await flush();
    expect(texte()).toContain("Ce mois-ci : 41 Go sur 50 Go");
    expect(texte()).toContain("80 % de votre limite");
    expect(texte()).toContain("7 jours avant la remise à zéro");
    expect(texte()).toContain("voit uniquement votre volume de données mensuel");
    expect(document.querySelector("progress").value).toBe(82);
  });
  it("coupé : message clair", async () => {
    const service = {
      consommation: async () => ({
        ok: true,
        valeur: {
          octets: 50e9,
          limiteGo: 50,
          pourcent: 100,
          alerte: true,
          suspendu: "limite",
          joursRestants: 3,
        },
      }),
    };
    document.body.append(blocConsommation({ service }).racine);
    await flush();
    expect(texte()).toContain("coupé jusqu'au 1er du mois prochain");
  });
});

const TABLEAU = {
  mois: "2026-11",
  serveur: {
    octets: 9e12,
    limiteGo: 10000,
    jours: { "01": 1e11, "02": 3e11 },
    securite: false,
    coupureSecurite: true,
  },
  invites: [
    {
      email: "ami@ex.org",
      etat: "actif",
      raison: null,
      octetsProxy: 3e9,
      octetsWireguard: 1e9,
      limiteGo: 50,
      derniereActivite: "2026-11-05",
    },
    {
      email: "coupe@ex.org",
      etat: "coupe",
      raison: "manuel",
      octetsProxy: 0,
      octetsWireguard: 0,
      limiteGo: null,
      derniereActivite: null,
    },
  ],
};
const serviceProprietaire = () => ({
  tableau: vi.fn(async () => ({ ok: true, valeur: TABLEAU })),
  couper: vi.fn(async () => ({ ok: true, valeur: { ok: true } })),
  retablir: vi.fn(async () => ({ ok: true, valeur: { ok: true } })),
  definirLimite: vi.fn(async () => ({ ok: true, valeur: { ok: true } })),
  coupureSecurite: vi.fn(async () => ({ ok: true, valeur: { ok: true } })),
});

describe("tableau du propriétaire", () => {
  it("volumes par ami, total serveur, alerte à 80 %, phrase de confidentialité, aucun site", async () => {
    const service = serviceProprietaire();
    document.body.append(blocTableauInvites({ service }).racine);
    await flush();
    expect(texte()).toContain("ami@ex.org");
    expect(texte()).toContain("Proxy 3 Go · WireGuard 1 Go");
    expect(texte()).toContain("dernière activité 05/11");
    expect(texte()).toContain("Serveur : 9 To sur 10 To gratuits (90 %)");
    expect(texte()).toContain("approche de sa limite gratuite");
    expect(texte()).toContain("jamais les sites visités");
    expect(document.querySelectorAll("svg rect")).toHaveLength(2);
    expect(texte()).not.toMatch(/https?:/);
  });

  it("couper demande confirmation puis appelle la fonction ; annuler n'appelle rien", async () => {
    const service = serviceProprietaire();
    document.body.append(blocTableauInvites({ service }).racine);
    await flush();
    demander.mockResolvedValueOnce(false);
    bouton("Couper maintenant").click();
    await flush();
    expect(service.couper).not.toHaveBeenCalled();
    demander.mockResolvedValueOnce(true);
    bouton("Couper maintenant").click();
    await flush();
    expect(service.couper).toHaveBeenCalledWith("ami@ex.org");
  });

  it("rétablir un ami coupé ; limite vide = illimité", async () => {
    const service = serviceProprietaire();
    document.body.append(blocTableauInvites({ service }).racine);
    await flush();
    bouton("Rétablir").click();
    await flush();
    expect(service.retablir).toHaveBeenCalledWith("coupe@ex.org");
    const champ = document.querySelector('input[aria-label^="Limite mensuelle de ami"]');
    champ.value = "";
    bouton("Enregistrer la limite").click();
    await flush();
    expect(service.definirLimite).toHaveBeenCalledWith("ami@ex.org", null);
  });

  it("limite invalide : aucun appel", async () => {
    const service = serviceProprietaire();
    document.body.append(blocTableauInvites({ service }).racine);
    await flush();
    const champ = document.querySelector('input[aria-label^="Limite mensuelle de ami"]');
    champ.value = "0";
    bouton("Enregistrer la limite").click();
    await flush();
    expect(service.definirLimite).not.toHaveBeenCalled();
  });
});
