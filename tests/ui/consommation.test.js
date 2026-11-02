// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { iaDe } from "../../src/core/ia.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";

const appelerIa = vi.fn();
vi.mock("../../src/firebase/charger.js", () => ({ chargerFirebase: async () => ({ appelerIa }) }));
const { ouvrirConsommation, graphiqueJours } = await import("../../src/ui/reglages/consommation.js");

const donnees = (extra = {}) => ({
  jour: "2026-11-21",
  mois: "2026-11",
  aujourdhui: { appels: 4, coutEstime: 0.0042 },
  ceMois: {
    total: { appels: 12, jetonsEntree: 9000, jetonsSortie: 3000, coutEstime: 0.0312 },
    jours: { 20: { appels: 8, coutEstime: 0.02 }, 21: { appels: 4, coutEstime: 0.0042 } },
    parUsage: {
      chat: { appels: 7, jetonsEntree: 5000, jetonsSortie: 2000, coutEstime: 0.02 },
      tags: { appels: 5, jetonsEntree: 4000, jetonsSortie: 1000, coutEstime: 0.0112 },
    },
    appelsEvites: 42,
  },
  precedents: [{ mois: "2026-10", total: { appels: 30, coutEstime: 0.1 }, appelsEvites: 3 }],
  limites: null,
  etatLimites: { atteinte: null, alertes: [] },
  prix: { majLe: Date.UTC(2026, 9, 15), tauxChange: {} },
  ...extra,
});
const vider = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const monter = async (reponse, reglagesIa = { actif: true }) => {
  document.body.replaceChildren();
  appelerIa.mockReset();
  appelerIa.mockResolvedValue(reponse);
  const store = creerStore(
    { ...etatInitial(), reglages: { ...etatInitial().reglages, ia: reglagesIa } },
    reduire,
  );
  ouvrirConsommation({ store });
  await vider();
  return { store, q: (s) => document.querySelector(s), qa: (s) => [...document.querySelectorAll(s)] };
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

describe("écran Consommation", () => {
  it("aujourd'hui, ce mois, tableau par usage, cache, mois précédents, mention d'estimation datée", async () => {
    const m = await monter(donnees());
    const texte = m.q(".conso").textContent;
    expect(appelerIa).toHaveBeenCalledWith("iaConsommation");
    // the month first, in large figures; today beside it
    expect(m.q(".conso-mois-bloc .conso-valeur").textContent).toBe("0,03 €");
    expect(m.q(".conso-legende").textContent).toBe("Estimé en novembre 2026");
    expect(m.q(".conso-mois-bloc .conso-details").textContent).toMatch(/12 appels12\s000 jetons/);
    expect(m.q(".conso-jour .conso-valeur").textContent).toBe("0,0042 €");
    expect(m.q(".conso-jour .conso-details").textContent).toBe("4 appels");
    expect(texte).toMatch(/42 appels évités grâce au cache/);
    expect(m.q('.conso-mois li[data-mois="2026-10"]').textContent).toMatch(/octobre 202630 appels0,10 €/);
    expect(texte).toMatch(/Estimation fondée sur les tarifs publics du 15\/10\/2026/);
    expect(texte).toMatch(/montant réel est celui facturé par votre fournisseur/);
    expect(m.qa(".conso-tableau tbody tr").map((r) => r.querySelector("th").textContent)).toEqual([
      "Discussion",
      "Tags",
    ]);
  });

  it("graphique SVG : une barre par jour, valeurs en titre (accessible)", async () => {
    const m = await monter(donnees());
    const svg = m.q(".conso-graphique");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelectorAll("rect")).toHaveLength(21);
    expect(svg.querySelectorAll("rect")[20].querySelector("title").textContent).toBe(
      "Le 21 : 4 appels",
    );
    expect(graphiqueJours({}, { jourDuMois: 5 }).querySelectorAll("rect")).toHaveLength(5);
  });

  it("modèle sans prix : « coût inconnu », jamais un faux zéro", async () => {
    const d = donnees();
    d.ceMois.sansPrix = 3;
    d.ceMois.total.coutEstime = 0;
    d.aujourdhui.coutEstime = 0;
    const m = await monter(d);
    expect(m.q(".conso-mois-bloc .conso-valeur").textContent).toBe("Prix inconnu");
    expect(m.q(".conso-jour .conso-valeur").textContent).toBe("Prix inconnu");
    expect(m.q(".conso").textContent).toMatch(/pas de prix connu/);
  });

  it("aucune utilisation : un message à la place d'un graphique vide, les limites restent", async () => {
    const d = donnees({ aujourdhui: { appels: 0, coutEstime: 0 }, precedents: [] });
    d.ceMois = { total: { appels: 0, jetonsEntree: 0, jetonsSortie: 0, coutEstime: 0 }, jours: {} };
    const m = await monter(d);
    expect(m.q(".conso-vide").textContent).toMatch(/Aucune utilisation ce mois-ci/);
    expect(m.q(".conso-graphique")).toBeNull();
    expect(m.q(".conso-tableau")).toBeNull();
    expect(m.q("#limite-jour-appels")).not.toBeNull();
  });

  it("la barre d'aujourd'hui est mise en avant ; le graphique propose Appels / Coût", async () => {
    const m = await monter(donnees());
    const barres = m.qa(".conso-barre");
    expect(barres.at(-1).classList.contains("conso-barre--aujourdhui")).toBe(true);
    expect(barres.filter((b) => b.classList.contains("conso-barre--aujourdhui"))).toHaveLength(1);
    const [appelsBtn, coutBtn] = m.qa(".conso-segments .segment");
    expect(appelsBtn.getAttribute("aria-checked")).toBe("true");
    coutBtn.click();
    expect(m.qa(".conso-segments .segment")[1].getAttribute("aria-checked")).toBe("true");
    expect(m.qa(".conso-barre").at(-1).querySelector("title").textContent).toBe("Le 21 : 0,0042 €");
  });

  it("alerte à 80 % et limite atteinte", async () => {
    const m80 = await monter(
      donnees({
        etatLimites: { atteinte: null, alertes: [{ periode: "jour", type: "appels", pourcent: 85 }] },
      }),
    );
    expect(m80.q(".conso-alerte").textContent).toBe(
      "Vous avez utilisé 85 % de votre limite du jour.",
    );
    const m100 = await monter(
      donnees({ etatLimites: { atteinte: { periode: "mois", type: "euros" }, alertes: [] } }),
    );
    expect(m100.q("[role=alert]").textContent).toMatch(/limite personnelle est atteinte/);
  });

  it("régler une limite l'enregistre dans les réglages synchronisés ; vide, elle disparaît", async () => {
    const m = await monter(donnees());
    const champ = m.q("#limite-jour-appels");
    champ.value = "20";
    champ.dispatchEvent(new Event("change"));
    expect(iaDe(m.store.lire().reglages).limites).toEqual({ jour: { appels: 20 } });
    await vider();
    const champEuros = m.q("#limite-mois-euros");
    champEuros.value = "3.5";
    champEuros.dispatchEvent(new Event("change"));
    expect(iaDe(m.store.lire().reglages).limites).toEqual({
      jour: { appels: 20 },
      mois: { euros: 3.5 },
    });
    await vider();
    const vide = m.q("#limite-jour-appels");
    vide.value = "";
    vide.dispatchEvent(new Event("change"));
    expect(iaDe(m.store.lire().reglages).limites).toEqual({ mois: { euros: 3.5 } });
  });

  it("erreur du serveur : message clair", async () => {
    document.body.replaceChildren();
    appelerIa.mockReset();
    appelerIa.mockRejectedValue({ code: "functions/unavailable" });
    ouvrirConsommation({ store: creerStore({ ...etatInitial() }, reduire) });
    await vider();
    expect(document.querySelector("[role=alert]").textContent).toMatch(/indisponible/i);
  });
});
