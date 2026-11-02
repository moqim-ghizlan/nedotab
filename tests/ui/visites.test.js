// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { creerServiceVisites } from "../../src/ui/services/visites.js";

function prefs() {
  const m = new Map();
  return {
    m,
    lire: async (c) => structuredClone(m.get(c) ?? null),
    ecrire: async (c, v) => void m.set(c, structuredClone(v)),
  };
}
const monter = (o = {}) => {
  let t = 1_800_000_000_000;
  const p = o.prefs ?? prefs();
  const envoyer = o.envoyer ?? vi.fn(async () => {});
  const majServeur = o.majServeur ?? vi.fn(async () => 0);
  const service = creerServiceVisites({
    prefs: p,
    actif: () => o.actif ?? true,
    uid: () => ("uid" in o ? o.uid : "u1"),
    base: async () => ({ envoyer, majServeur }),
    maintenant: () => t,
  });
  return { service, p, envoyer, majServeur, avancer: (ms) => (t += ms) };
};

describe("file de visites (V4.21)", () => {
  it("enregistre avant navigation dans la file locale durable", async () => {
    const { service, p } = monter();
    await service.enregistrer("a");
    expect(p.m.get("visitesEnAttente")).toHaveLength(1);
  });
  it("deux ouvertures en moins de 10 s comptent pour une", async () => {
    const { service, avancer } = monter();
    await service.enregistrer("a");
    avancer(5000);
    await service.enregistrer("a");
    avancer(6000);
    await service.enregistrer("a");
    expect(service.enAttente()).toBe(2);
  });
  it("envoi groupé en UNE écriture, file vidée après confirmation", async () => {
    const { service, envoyer, p, avancer } = monter();
    await service.enregistrer("a");
    avancer(20_000);
    await service.enregistrer("b");
    await service.enregistrer("c");
    await service.envoyer();
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(Object.keys(envoyer.mock.calls[0][1].poids).sort()).toEqual(["a", "b", "c"]);
    expect(p.m.get("visitesEnAttente")).toEqual([]);
  });
  it("échec réseau : les visites sont conservées, sans double comptage ensuite", async () => {
    const envoyer = vi.fn().mockRejectedValueOnce(new Error("réseau")).mockResolvedValue();
    const { service } = monter({ envoyer });
    await service.enregistrer("a");
    await service.envoyer();
    expect(service.enAttente()).toBe(1);
    await service.envoyer();
    expect(envoyer).toHaveBeenCalledTimes(2);
    expect(envoyer.mock.calls[1][1].compte.a).toBe(1);
    expect(service.enAttente()).toBe(0);
  });
  it("page fermée pendant l'écriture : pas de renvoi si le serveur l'a reçue", async () => {
    const p = prefs();
    p.m.set("visitesEnAttente", [{ id: "a", quand: 5, lot: "x", envoyeLe: 1_800_000_000_000 }]);
    const recue = monter({ prefs: p, majServeur: vi.fn(async () => 1_800_000_000_500) });
    await recue.service.envoyer();
    expect(recue.envoyer).not.toHaveBeenCalled();
    expect(p.m.get("visitesEnAttente")).toEqual([]);

    p.m.set("visitesEnAttente", [{ id: "a", quand: 5, lot: "x", envoyeLe: 1_800_000_000_000 }]);
    const perdue = monter({ prefs: p, majServeur: vi.fn(async () => 0) });
    await perdue.service.envoyer();
    expect(perdue.envoyer).toHaveBeenCalledTimes(1);
  });
  it("suivi désactivé : rien n'est enregistré", async () => {
    const { service } = monter({ actif: false });
    await service.enregistrer("a");
    expect(service.enAttente()).toBe(0);
  });
  it("non connecté : stockage local, puis fusion dans la base", async () => {
    const non = monter({ uid: null });
    await non.service.enregistrer("a");
    await non.service.envoyer();
    expect(non.envoyer).not.toHaveBeenCalled();
    expect(non.p.m.get("visitesLocales").compte.a).toBe(1);
    const envoyer = vi.fn(async () => {});
    const oui = monter({ prefs: non.p, envoyer });
    expect(await oui.service.fusionnerLocalesDansBase()).toBe(true);
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(non.p.m.get("visitesLocales")).toBeNull();
  });
  it("vider efface la file et les visites locales", async () => {
    const { service, p } = monter();
    await service.enregistrer("a");
    await service.vider();
    expect(p.m.get("visitesEnAttente")).toEqual([]);
    expect(service.enAttente()).toBe(0);
  });
  it("n'attend jamais plus de 150 ms avant la navigation", async () => {
    vi.useFakeTimers();
    const lent = { lire: () => new Promise(() => {}), ecrire: async () => {} };
    const { service } = monter({ prefs: lent });
    const fin = vi.fn();
    service.enregistrerAvantNavigation("a").then(fin);
    await vi.advanceTimersByTimeAsync(149);
    expect(fin).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fin).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
