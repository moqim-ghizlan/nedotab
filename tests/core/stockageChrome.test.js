import { describe, expect, it, vi } from "vitest";
import { creerStockage } from "../../src/platform/stockageChrome.js";

function fauxChrome() {
  const donnees = {};
  const ecouteurs = new Set();
  return {
    zone: {
      async get(cle) {
        return { [cle]: donnees[cle] };
      },
      async set(obj) {
        for (const [cle, valeur] of Object.entries(obj)) {
          const ancien = donnees[cle];
          donnees[cle] = structuredClone(valeur);
          ecouteurs.forEach((f) => f({ [cle]: { oldValue: ancien, newValue: valeur } }, "local"));
        }
      },
    },
    evenements: {
      addListener: (f) => ecouteurs.add(f),
      removeListener: (f) => ecouteurs.delete(f),
    },
  };
}

describe("stockage chrome", () => {
  it("charge null quand rien n'est stocké, puis relit ce qui a été écrit sans métadonnées", async () => {
    const c = fauxChrome();
    const s = creerStockage(c.zone, c.evenements, "A");
    expect(await s.charger()).toBeNull();
    await s.sauvegarder({ versionSchema: 1, grille: [] });
    expect(await s.charger()).toEqual({ versionSchema: 1, grille: [] });
  });
  it("une instance ignore ses propres écritures, pas celles des autres", async () => {
    const c = fauxChrome();
    const a = creerStockage(c.zone, c.evenements, "A");
    const b = creerStockage(c.zone, c.evenements, "B");
    const fa = vi.fn();
    const fb = vi.fn();
    a.surChangementExterne(fa);
    const stop = b.surChangementExterne(fb);
    await a.sauvegarder({ grille: [1] });
    expect(fa).not.toHaveBeenCalled();
    expect(fb).toHaveBeenCalledWith({ grille: [1] }, expect.objectContaining({ ecritPar: "A" }));
    stop();
    await a.sauvegarder({ grille: [2] });
    expect(fb).toHaveBeenCalledTimes(1);
  });
});
