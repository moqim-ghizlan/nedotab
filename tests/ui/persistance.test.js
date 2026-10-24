import { afterEach, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { creerSite, etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { brancherPersistance } from "../../src/ui/persistance.js";

afterEach(() => vi.useRealTimers());

function fauxStockage() {
  let rappel;
  return {
    sauvegarder: vi.fn(async () => {}),
    surChangementExterne: (f) => ((rappel = f), () => {}),
    externe: (etat) => rappel(etat),
  };
}

describe("persistance", () => {
  it("regroupe les écritures (debounce) et n'écrit pas les chargements externes", async () => {
    vi.useFakeTimers();
    const store = creerStore(etatInitial(), reduire);
    const stockage = fauxStockage();
    brancherPersistance(store, stockage, { delai: 300 });
    store.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "A", url: "https://a.com" }) });
    store.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "B", url: "https://b.com" }) });
    await vi.advanceTimersByTimeAsync(350);
    expect(stockage.sauvegarder).toHaveBeenCalledTimes(1);
    stockage.externe({ versionSchema: 1, grille: [] });
    await vi.advanceTimersByTimeAsync(350);
    expect(stockage.sauvegarder).toHaveBeenCalledTimes(1);
    expect(store.lire().grille).toEqual([]);
  });
  it("écrit immédiatement à la sortie de page", () => {
    vi.useFakeTimers();
    const store = creerStore(etatInitial(), reduire);
    const stockage = fauxStockage();
    brancherPersistance(store, stockage);
    store.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "A", url: "https://a.com" }) });
    window.dispatchEvent(new Event("pagehide"));
    expect(stockage.sauvegarder).toHaveBeenCalledTimes(1);
  });
  it("n'écrit rien en lecture seule", async () => {
    vi.useFakeTimers();
    const store = creerStore(etatInitial(), reduire);
    const stockage = fauxStockage();
    brancherPersistance(store, stockage, { lectureSeule: () => true });
    store.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "A", url: "https://a.com" }) });
    await vi.advanceTimersByTimeAsync(400);
    expect(stockage.sauvegarder).not.toHaveBeenCalled();
  });
});
