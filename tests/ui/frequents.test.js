import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerFrequents } from "../../src/ui/frequents.js";
import { definirSurVisite, suivreOuverturesTuiles } from "../../src/ui/tuile.js";

const site = (id, extra = {}) => ({
  id,
  type: "site",
  titre: id.toUpperCase(),
  url: `https://${id}.fr`,
  icone: { type: "lettre", couleur: "#336699" },
  creeLe: 0,
  ...extra,
});
const ligne = (s, score, compte) => ({ site: s, score, compte, derniere: 0 });

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});
afterEach(() => {
  document.body.replaceChildren();
  definirSurVisite(null);
});

function monter(grille, classement) {
  const store = creerStore({ ...etatInitial(), grille }, reduire);
  let courant = classement;
  const abonnes = new Set();
  const usage = {
    classement: () => courant,
    charge: () => true,
    abonner: (f) => (abonnes.add(f), () => abonnes.delete(f)),
  };
  const f = creerFrequents({
    store,
    usage,
    suiviActif: () => true,
    afficherDansGrille: vi.fn(),
    modifierSite: vi.fn(),
  });
  const conteneur = document.createElement("div");
  document.body.append(conteneur);
  conteneur.append(f.racine);
  return { store, f, nouvellesStats: (c) => (courant = c) };
}

const titres = (f) => [...f.racine.querySelectorAll(".frequent-titre")].map((n) => n.textContent);

describe("rangée « Les plus utilisés » (V4.22)", () => {
  const grille = [site("a"), site("b"), site("c"), site("d")];
  const classement = [
    ligne(grille[0], 5, 5),
    ligne(grille[1], 3, 3),
    ligne(grille[2], 1, 2),
  ];

  it("apparaît quand il y a assez de données, une seule ligne de liens", () => {
    const { f } = monter(grille, classement);
    expect(f.racine.hidden).toBe(false);
    expect(titres(f)).toEqual(["A", "B", "C"]);
    expect(f.racine.getAttribute("aria-label")).toBe("Les plus utilisés");
    expect(f.racine.querySelectorAll("a[draggable='false']")).toHaveLength(3);
  });
  it("cachée sans assez de données", () => {
    const { f } = monter(grille, [ligne(grille[0], 1, 1)]);
    expect(f.racine.hidden).toBe(true);
  });
  it("ordre figé : de nouvelles statistiques ne changent rien", () => {
    const { f, store, nouvellesStats } = monter(grille, classement);
    nouvellesStats([ligne(grille[2], 99, 99), ...classement]);
    store.envoyer({ type: A.SITE_MODIFIER, id: "d", changements: { titre: "Autre" } });
    expect(titres(f)).toEqual(["A", "B", "C"]);
  });
  it("renommer ou supprimer un site de la rangée la met à jour tout de suite", () => {
    const { f, store } = monter(grille, classement);
    store.envoyer({ type: A.SITE_MODIFIER, id: "b", changements: { titre: "Beta" } });
    expect(titres(f)).toEqual(["A", "Beta", "C"]);
    store.envoyer({ type: A.ELEMENT_SUPPRIMER, id: "a" });
    expect(titres(f)).toEqual(["Beta", "C"]);
  });
  it("épingler un site l'ajoute en tête immédiatement", () => {
    const { f, store } = monter(grille, classement);
    store.envoyer({ type: A.SITE_MODIFIER, id: "d", changements: { epingle: true } });
    expect(titres(f)[0]).toBe("D");
  });
  it("masquer retire le site, Annuler le remet (réglage synchronisé)", () => {
    const { f, store } = monter(grille, [...classement, ligne(grille[3], 0.8, 1)]);
    store.envoyer({
      type: A.REGLAGES_MODIFIER,
      changements: { frequents: { afficher: true, titre: false, masques: ["b"] } },
    });
    expect(titres(f)).toEqual(["A", "C", "D"]);
    store.envoyer({
      type: A.REGLAGES_MODIFIER,
      changements: { frequents: { afficher: true, titre: false, masques: [] } },
    });
    expect(titres(f)).toEqual(["A", "B", "C", "D"]);
  });
  it("réglage « Afficher » désactivé : la rangée disparaît", () => {
    const { f, store } = monter(grille, classement);
    store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { frequents: { afficher: false } } });
    expect(f.racine.hidden).toBe(true);
  });
  it("clavier : ← → dans la rangée, focaliser() entre dedans", () => {
    const { f } = monter(grille, classement);
    expect(f.focaliser()).toBe(true);
    const liens = [...f.racine.querySelectorAll(".frequent-lien")];
    expect(document.activeElement).toBe(liens[0]);
    liens[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(liens[1]);
    liens[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(liens[0]);
  });
  it("un clic dans la rangée compte une visite par le service commun", async () => {
    const { f } = monter(grille, classement);
    const visite = vi.fn(() => Promise.resolve());
    definirSurVisite(visite);
    const arret = suivreOuverturesTuiles(document);
    const lien = f.racine.querySelector(".frequent-lien");
    const clic = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    lien.dispatchEvent(clic);
    arret();
    expect(visite).toHaveBeenCalledWith("a");
  });
});

describe("bloc d'accueil : la place est réservée dès le premier rendu (TODO 9)", () => {
  const grille = [site("a"), site("b"), site("c")];
  const classement = grille.map((g, i) => ligne(g, 5 - i, 5 - i));

  function monterAccueil({ charge, memo, garder = false }) {
    if (!garder) localStorage.clear();
    if (memo) localStorage.setItem("nedotab:frequentsAccueil", String(memo));
    const etat = etatInitial();
    const store = creerStore({ ...etat, grille, reglages: { ...etat.reglages, frequents: { ...(etat.reglages.frequents ?? {}), accueil: true } } }, reduire);
    const abonnes = new Set();
    let pret = charge;
    const usage = { classement: () => classement, charge: () => pret, abonner: (f) => (abonnes.add(f), () => abonnes.delete(f)) };
    const f = creerFrequents({
      store, usage, suiviActif: () => true, afficherDansGrille: vi.fn(), modifierSite: vi.fn(),
      accueil: true, lireAffichage: () => true, maximum: () => 8,
    });
    document.body.append(f.racine);
    return { f, arriver: () => ((pret = true), abonnes.forEach((x) => x())) };
  }

  it("avant les chiffres : emplacements gris au nombre mémorisé, rangée visible, aucun clic possible", () => {
    const { f } = monterAccueil({ charge: false, memo: 3 });
    expect(f.racine.hidden).toBe(false);
    expect(f.racine.querySelectorAll(".frequent--squelette")).toHaveLength(3);
    expect(f.racine.classList.contains("frequents--chargement")).toBe(true);
    expect(f.racine.style.minHeight).toBe("48px");
  });

  it("à l'arrivée des chiffres : vraies pastilles, même hauteur réservée jusqu'à la fin, clics protégés 300 ms", () => {
    vi.useFakeTimers();
    const { f, arriver } = monterAccueil({ charge: false, memo: 3 });
    arriver();
    expect(f.racine.querySelectorAll(".frequent--squelette")).toHaveLength(0);
    expect(f.racine.querySelectorAll(".frequent-lien")).toHaveLength(3);
    expect(f.racine.classList.contains("frequents--stabilisation")).toBe(true);
    vi.advanceTimersByTime(350);
    expect(f.racine.classList.contains("frequents--stabilisation")).toBe(false);
    expect(localStorage.getItem("nedotab:frequentsAccueil")).toBe("3");
    vi.useRealTimers();
  });

  it("réglage activé : la place reste réservée même sans aucune icône (la barre ne bouge jamais)", () => {
    const a = monterAccueil({ charge: false, memo: 0 });
    expect(a.f.racine.hidden).toBe(false);
    expect(a.f.racine.style.minHeight).toBe("48px");
    a.arriver();
    expect(a.f.racine.hidden).toBe(false);
    expect(a.f.racine.style.minHeight).toBe("48px");
  });
});
