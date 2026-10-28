import { describe, expect, it, vi } from "vitest";
import { A } from "../../src/core/actions.js";
import { creerEnrichissement } from "../../src/ui/services/enrichissement.js";

const prete = { ia: { actif: true }, modeCompte: true, enLigne: true, cles: [{ fournisseur: "gemini", valide: true }] };

function monter({ contexte = prete, lirePagesWeb = true, appeler } = {}) {
  const actions = [];
  const store = { envoyer: (a) => actions.push(a), lire: () => ({}) };
  const e = creerEnrichissement({
    store,
    plateforme: { capacites: { lirePagesWeb }, lireExtrait: async () => null },
    contexte: async () => contexte,
    appeler,
    horloge: () => 1,
  });
  return { e, actions };
}

describe("enrichissement", () => {
  it("IA non prête ou PWA : rien ne se passe", async () => {
    const appeler = vi.fn();
    expect(await monter({ contexte: { ...prete, cles: [] }, appeler }).e.demander({ id: "a", url: "https://a.fr" })).toBe(false);
    expect(await monter({ lirePagesWeb: false, appeler }).e.demander({ id: "a", url: "https://a.fr" })).toBe(false);
    expect(appeler).not.toHaveBeenCalled();
  });
  it("succès : en_attente puis ok", async () => {
    const { e, actions } = monter({ appeler: async () => ({ tags: ["a"], description: "d" }) });
    await e.demander({ id: "s", url: "https://a.fr", titre: "A" });
    await vi.waitFor(() => expect(e.enAttente()).toBe(0));
    expect(actions.map((a) => a.etat)).toEqual(["en_attente", "ok"]);
    expect(actions[1]).toMatchObject({ type: A.SITE_DEFINIR_IA, id: "s", tags: ["a"] });
  });
  it("échec : état echec avec le code", async () => {
    const { e, actions } = monter({ appeler: async () => Promise.reject({ details: { code: "cle-invalide" } }) });
    await e.demander({ id: "s", url: "https://a.fr" });
    await vi.waitFor(() => expect(e.enAttente()).toBe(0));
    expect(actions.at(-1)).toMatchObject({ etat: "echec", erreur: "cle-invalide" });
  });
  it("5 ajouts rapides : 2 appels simultanés au plus", async () => {
    let actifs = 0, max = 0;
    const appeler = async () => {
      max = Math.max(max, ++actifs);
      await new Promise((r) => setTimeout(r, 5));
      actifs--;
      return { tags: ["a"], description: "d" };
    };
    const { e } = monter({ appeler });
    for (let i = 0; i < 5; i++) await e.demander({ id: `s${i}`, url: "https://a.fr" });
    await vi.waitFor(() => expect(e.enAttente()).toBe(0));
    expect(max).toBe(2);
  });
});
