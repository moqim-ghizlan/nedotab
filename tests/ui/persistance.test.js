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

describe("deux onglets qui écrivent presque en même temps", () => {
  function fauxChromeLent() {
    let donnees;
    const ecouteurs = new Set();
    return {
      zone: {
        async get(cle) {
          return { [cle]: donnees && structuredClone(donnees) };
        },
        async set(obj) {
          donnees = structuredClone(obj.etat);
          // Notifications reach the other tabs late, like a busy browser.
          setTimeout(
            () => ecouteurs.forEach((f) => f({ etat: { newValue: donnees } }, "local")),
            50,
          );
        },
      },
      evenements: {
        addListener: (f) => ecouteurs.add(f),
        removeListener: (f) => ecouteurs.delete(f),
      },
    };
  }

  it("aucun site n'est perdu", async () => {
    vi.useFakeTimers();
    const { creerStockage } = await import("../../src/platform/stockageChrome.js");
    const chrome = fauxChromeLent();
    const onglet = (id) => {
      const store = creerStore(etatInitial(), reduire);
      brancherPersistance(store, creerStockage(chrome.zone, chrome.evenements, id), {
        reduire,
        delai: 10,
      });
      return store;
    };
    const a = onglet("A");
    const b = onglet("B");
    a.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "A", url: "https://a.com" }) });
    await vi.advanceTimersByTimeAsync(20); // A writes, B not notified yet
    b.envoyer({ type: A.SITE_AJOUTER, site: creerSite({ titre: "B", url: "https://b.com" }) });
    await vi.advanceTimersByTimeAsync(500);
    const titres = (s) =>
      s
        .lire()
        .grille.map((x) => x.titre)
        .sort();
    expect(titres(a)).toEqual(["A", "B"]);
    expect(titres(b)).toEqual(["A", "B"]);
  });
});

describe("changement reçu d'un autre appareil", () => {
  it("est écrit dans le cache local, contrairement aux chargements", async () => {
    vi.useFakeTimers();
    const store = creerStore(etatInitial(), reduire);
    const stockage = fauxStockage();
    brancherPersistance(store, stockage, { delai: 300 });
    store.envoyer({ type: A.CHARGER, etat: { ...etatInitial(), grille: [] } });
    await vi.advanceTimersByTimeAsync(400);
    expect(stockage.sauvegarder).not.toHaveBeenCalled();
    store.envoyer({
      type: A.CHARGER,
      origine: "distant",
      etat: { ...etatInitial(), grille: [creerSite({ titre: "D", url: "https://d.fr" })] },
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(stockage.sauvegarder).toHaveBeenCalledTimes(1);
  });
});
