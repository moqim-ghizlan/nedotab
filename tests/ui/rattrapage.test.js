import { describe, expect, it, vi } from "vitest";
import { A } from "../../src/core/actions.js";
import { creerRattrapage } from "../../src/ui/services/rattrapage.js";

const site = (id) => ({
  type: "site",
  id,
  titre: id,
  url: `https://${id}.fr`,
  tags: [],
  ia: { etat: "aucun" },
});

function monter({ n = 6, executer } = {}) {
  const grille = Array.from({ length: n }, (_, i) => site(`s${i}`));
  const etat = { grille, reglages: {} };
  const envoyes = [];
  const store = { lire: () => etat, envoyer: (a) => envoyes.push(a) };
  const prefs = new Map();
  const preferences = {
    lire: async (k) => prefs.get(k) ?? null,
    ecrire: async (k, v) => void prefs.set(k, v),
  };
  let actifs = 0;
  let max = 0;
  const enrichissement = {
    executer: vi.fn(async (s) => {
      max = Math.max(max, ++actifs);
      await new Promise((r) => setTimeout(r, 3));
      actifs--;
      return executer ? executer(s) : { ok: true };
    }),
  };
  const r = creerRattrapage({
    store,
    enrichissement,
    quotaRestant: async () => 100,
    preferences,
    idAppareil: async () => "pc",
    attendre: (ms) => new Promise((res) => setTimeout(res, Math.min(ms, 2))),
    ecart: 0,
  });
  return { r, envoyes, enrichissement, prefs, max: () => max, grille };
}
const fini = (r, etat = "termine") => vi.waitFor(() => expect(r.lire().etat).toBe(etat));
const toutDemarrer = async (m) => m.r.demarrer((await m.r.estimer({ portee: "sansTags" })).ids);

describe("rattrapage : exécution", () => {
  it("50 sites, 2 simultanés au plus, rapport final", async () => {
    const m = monter({ n: 50 });
    expect((await m.r.estimer({ portee: "sansTags" })).ids).toHaveLength(50);
    await toutDemarrer(m);
    await fini(m.r);
    expect(m.r.lire()).toMatchObject({ ok: 50, echecs: [] });
    expect(m.max()).toBeLessThanOrEqual(2);
    expect(m.prefs.get("rattrapageIa")).toBeNull();
  });

  it("un échec isolé n'arrête pas le traitement", async () => {
    const m = monter({
      n: 5,
      executer: (s) => (s.id === "s2" ? { ok: false, code: "reponse-invalide" } : { ok: true }),
    });
    await toutDemarrer(m);
    await fini(m.r);
    expect(m.r.lire().ok).toBe(4);
    expect(m.r.lire().echecs).toMatchObject([{ id: "s2", code: "reponse-invalide" }]);
  });

  it("erreur bloquante : pause avec la raison, le site reste à faire", async () => {
    const m = monter({ n: 5, executer: () => ({ ok: false, code: "cle-invalide" }) });
    await toutDemarrer(m);
    await fini(m.r, "pause");
    expect(m.r.lire().raison).toBe("cle-invalide");
    expect(m.r.lire().restants.length).toBeGreaterThan(0);
    expect(m.r.lire().echecs).toEqual([]);
  });

  it("pause puis reprise : tout finit, rien n'est fait deux fois", async () => {
    const m = monter({ n: 10 });
    await toutDemarrer(m);
    m.r.pause();
    await new Promise((r) => setTimeout(r, 30));
    expect(m.r.lire().etat).toBe("pause");
    await m.r.reprendre();
    await fini(m.r);
    const appeles = m.enrichissement.executer.mock.calls.map((c) => c[0].id);
    expect(appeles).toHaveLength(10);
    expect(new Set(appeles).size).toBe(10);
  });

  it("arrêt : rapport « arrêté », plus rien n'est lancé", async () => {
    const m = monter({ n: 20 });
    await toutDemarrer(m);
    await m.r.arreter();
    const appels = m.enrichissement.executer.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(m.r.lire()).toMatchObject({ etat: "termine", raison: "arrete" });
    expect(m.enrichissement.executer.mock.calls.length).toBeLessThanOrEqual(appels + 2);
  });

  it("reprise après fermeture : état retrouvé en pause, puis tout finit", async () => {
    const m = monter({ n: 8 });
    await toutDemarrer(m);
    await vi.waitFor(() => expect(m.r.lire().restants.length).toBeLessThan(8));
    m.r.pause();
    await new Promise((r) => setTimeout(r, 20));
    const garde = structuredClone(m.prefs.get("rattrapageIa"));
    expect(garde.etat).toBe("pause");
    // New instance, as after a restart, with the state kept on the device.
    const m2 = monter({ n: 8 });
    m2.prefs.set("rattrapageIa", garde);
    expect(await m2.r.retrouver()).toMatchObject({ etat: "pause", raison: "interrompu" });
    await m2.r.reprendre();
    await fini(m2.r);
    expect(m2.r.lire().restants).toEqual([]);
  });

  it("site supprimé ou tagsManuels entre-temps : ignoré", async () => {
    const m = monter({ n: 3 });
    const { ids } = await m.r.estimer({ portee: "sansTags" });
    m.grille[1].tagsManuels = true;
    m.grille.splice(2, 1);
    await m.r.demarrer(ids);
    await fini(m.r);
    expect(m.enrichissement.executer.mock.calls.map((c) => c[0].id)).toEqual(["s0"]);
  });

  it("le verrou est posé au démarrage et retiré à la fin", async () => {
    const m = monter({ n: 2 });
    await toutDemarrer(m);
    await fini(m.r);
    const verrous = m.envoyes
      .filter((a) => a.type === A.REGLAGES_MODIFIER)
      .map((a) => a.changements.ia.rattrapage);
    expect(verrous[0]).toMatchObject({ appareil: "pc" });
    expect(verrous.at(-1)).toBeUndefined();
  });
});
