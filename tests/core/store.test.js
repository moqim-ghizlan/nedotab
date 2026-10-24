import { describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { creerSite, etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";

describe("store", () => {
  it("envoyer notifie les abonnés", () => {
    const store = creerStore(etatInitial(), reduire);
    const f = vi.fn();
    store.abonner(f);
    store.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "A", url: "https://a.com" }) });
    expect(f).toHaveBeenCalledTimes(1);
    expect(store.lire().grille).toHaveLength(1);
  });
  it("une action inconnue ne notifie pas", () => {
    const store = creerStore(etatInitial(), reduire);
    const f = vi.fn();
    store.abonner(f);
    store.envoyer({ type: "INCONNUE" });
    expect(f).not.toHaveBeenCalled();
  });
  it("abonner renvoie une fonction de désabonnement", () => {
    const store = creerStore(etatInitial(), reduire);
    const f = vi.fn();
    const stop = store.abonner(f);
    stop();
    store.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "A", url: "https://a.com" }) });
    expect(f).not.toHaveBeenCalled();
  });
  it("l'état est gelé en développement", () => {
    const store = creerStore(etatInitial(), reduire, { geler: true });
    expect(() => store.lire().grille.push(1)).toThrow();
  });
});
