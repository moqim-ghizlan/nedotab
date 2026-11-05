import { afterEach, describe, expect, it, vi } from "vitest";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const attendre = () => new Promise((r) => setTimeout(r, 0));
const sujet = (id, extra = {}) => ({
  id,
  nom: id,
  ordre: 1000,
  couleur: null,
  creeLe: 1,
  nbRestants: 0,
  nbTotal: 0,
  enAttente: false,
  ...extra,
});

function monter({ sujets = [], disponible = true, compteurs = { nbSujets: sujets.length } } = {}) {
  let rappelSujets = null;
  const fb = {
    ecouterSujets: vi.fn((_u, rappel) => {
      rappelSujets = rappel;
      queueMicrotask(() => rappel(sujets, { depuisCache: false, enAttente: false }));
      return () => {};
    }),
    ecouterCompteursTodos: vi.fn((_u, rappel) => {
      queueMicrotask(() => rappel({ nbSujets: 0, nbTodos: 0, octets: 0, ...compteurs }));
      return () => {};
    }),
    creerSujetTodos: vi.fn(async () => "nouveau"),
    majSujet: vi.fn(async () => {}),
    supprimerSujet: vi.fn(async () => 0),
    ecrireOrdresTodos: vi.fn(async () => {}),
    ecouterTodos: vi.fn((_u, _s, rappel) => {
      queueMicrotask(() => rappel([], { depuisCache: false, enAttente: false, plein: false }));
      return () => {};
    }),
  };
  const fermerAutres = vi.fn();
  const connecter = vi.fn(async () => {});
  const p = creerPanneauTodos({
    disponible: () => disponible,
    charger: async () => fb,
    uid: () => "u1",
    fermerAutres,
    connecter,
  });
  document.body.append(p.bouton, p.panneau);
  return { p, fb, fermerAutres, connecter, pousser: (s) => rappelSujets(s, { depuisCache: false, enAttente: false }) };
}

describe("panneau des todos", () => {
  it("ouvre et ferme, avec aria-expanded et restitution du focus", async () => {
    const { p } = monter();
    p.bouton.focus();
    p.bouton.click();
    await attendre();
    expect(p.panneau.hidden).toBe(false);
    expect(p.bouton.getAttribute("aria-expanded")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(p.panneau.hidden).toBe(true);
    expect(p.bouton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(p.bouton);
  });

  it("ferme les autres panneaux à l'ouverture", async () => {
    const { p, fermerAutres } = monter();
    p.ouvrir();
    expect(fermerAutres).toHaveBeenCalledOnce();
  });

  it("non connecté : le bouton reste, le panneau propose de se connecter", async () => {
    const { p, connecter, fb } = monter({ disponible: false });
    p.ouvrir();
    expect(p.panneau.textContent).toContain("Connectez-vous pour utiliser vos todos");
    p.panneau.querySelector(".bouton--principal").click();
    expect(connecter).toHaveBeenCalled();
    expect(fb.ecouterSujets).not.toHaveBeenCalled();
  });

  it("état vide puis liste des sujets", async () => {
    const { p } = monter({ sujets: [] });
    p.ouvrir();
    await attendre();
    await attendre();
    expect(p.panneau.textContent).toContain("Aucun sujet — créez-en un pour ranger vos todos");
  });

  it("affiche un nom hostile comme texte", async () => {
    const nom = "<img src=x onerror=alert(1)>";
    const { p } = monter({ sujets: [sujet("a", { nom })] });
    p.ouvrir();
    await attendre();
    await attendre();
    expect(p.panneau.querySelector("img")).toBeNull();
    expect(p.panneau.querySelector(".todos-sujet-nom").textContent).toBe(nom);
  });

  it("résumé : restants, tout est fait, aucun todo", async () => {
    const { p } = monter({
      sujets: [
        sujet("a", { nbTotal: 3, nbRestants: 3, ordre: 1 }),
        sujet("b", { nbTotal: 2, nbRestants: 0, ordre: 2 }),
        sujet("c", { ordre: 3 }),
      ],
    });
    p.ouvrir();
    await attendre();
    await attendre();
    const resumes = [...p.panneau.querySelectorAll(".todos-sujet-resume")].map((n) => n.textContent);
    expect(resumes).toEqual(["3 restants", "Tout est fait", "Aucun todo"]);
  });

  it("crée un sujet depuis le champ", async () => {
    const { p, fb } = monter({ sujets: [sujet("a")] });
    p.ouvrir();
    await attendre();
    await attendre();
    const champ = p.panneau.querySelector(".todos-champ");
    champ.value = "  Courses ";
    p.panneau.querySelector(".todos-ajout").dispatchEvent(new Event("submit", { cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.creerSujetTodos).toHaveBeenCalledOnce();
    expect(fb.creerSujetTodos.mock.calls[0][1]).toMatchObject({ nom: "Courses" });
  });

  it("refuse un 31e sujet : champ désactivé et message", async () => {
    const sujets = Array.from({ length: 30 }, (_, i) => sujet(`s${i}`, { ordre: i }));
    const { p, fb } = monter({ sujets });
    p.ouvrir();
    await attendre();
    await attendre();
    const champ = p.panneau.querySelector(".todos-champ");
    expect(champ.disabled).toBe(true);
    expect(champ.placeholder).toBe("30 sujets maximum");
    expect(fb.creerSujetTodos).not.toHaveBeenCalled();
  });

  it("ouvrir un sujet affiche l'écran vide et « Sujets » ramène à la liste", async () => {
    const { p } = monter({ sujets: [sujet("a", { nom: "Maison" })] });
    p.ouvrir();
    await attendre();
    await attendre();
    p.panneau.querySelector(".todos-sujet-corps").click();
    expect(p.sujetOuvert()).toBe("a");
    expect(p.panneau.querySelector(".todos-titre").textContent).toBe("Maison");
    expect(p.panneau.textContent).toContain("Rien à faire ici");
    p.panneau.querySelector(".todos-retour").click();
    expect(p.sujetOuvert()).toBeNull();
    expect(p.panneau.querySelector(".todos-sujets")).not.toBeNull();
  });

  it("suppression : confirmation avec le nombre, annulation avant 5 s = aucune écriture", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = monter({ sujets: [sujet("a", { nbTotal: 5, nbRestants: 5 })] });
    p.ouvrir();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);
    // The same code as the menu entry "Supprimer…".
    p.panneau.querySelector(".todos-sujet").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Supprimer…").click();
    await vi.advanceTimersByTimeAsync(1);
    const dialogue = document.querySelector("dialog");
    expect(dialogue.textContent).toContain("ses 5 todos");
    dialogue.querySelector('[data-valeur="true"]').click();
    await vi.advanceTimersByTimeAsync(1);
    expect(p.panneau.querySelector(".todos-sujet")).toBeNull();
    document.querySelector(".toast-action").click();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fb.supprimerSujet).not.toHaveBeenCalled();
    expect(p.panneau.querySelector(".todos-sujet")).not.toBeNull();
  });

  it("suppression confirmée : écriture après 5 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { p, fb } = monter({ sujets: [sujet("a")] });
    p.ouvrir();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);
    p.panneau.querySelector(".todos-sujet").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Supprimer…").click();
    await vi.advanceTimersByTimeAsync(10);
    expect(fb.supprimerSujet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5100);
    expect(fb.supprimerSujet).toHaveBeenCalledWith("u1", "a");
  });

  it("réordonner n'écrit que le sujet déplacé", async () => {
    const sujets = [sujet("a", { ordre: 1000 }), sujet("b", { ordre: 2000 }), sujet("c", { ordre: 3000 })];
    const { p, fb } = monter({ sujets });
    p.ouvrir();
    await attendre();
    await attendre();
    const ligneC = p.panneau.querySelector('[data-id="c"] .todos-poignee');
    ligneC.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.majSujet).toHaveBeenCalledTimes(1);
    expect(fb.majSujet).toHaveBeenCalledWith("u1", "c", { ordre: 1500 });
    expect(fb.ecrireOrdresTodos).not.toHaveBeenCalled();
  });

  it("renumérote tout quand l'écart est épuisé", async () => {
    const sujets = [sujet("a", { ordre: 1 }), sujet("b", { ordre: 1.0001 }), sujet("c", { ordre: 3 })];
    const { p, fb } = monter({ sujets });
    p.ouvrir();
    await attendre();
    await attendre();
    p.panneau
      .querySelector('[data-id="c"] .todos-poignee')
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await attendre();
    await attendre();
    expect(fb.ecrireOrdresTodos).toHaveBeenCalledOnce();
    expect([...fb.ecrireOrdresTodos.mock.calls[0][2].keys()]).toEqual(["a", "c", "b"]);
  });

  it("le focus reste piégé dans le panneau (Tab sur le dernier élément)", async () => {
    const { p } = monter({ sujets: [sujet("a")] });
    p.ouvrir();
    await attendre();
    await attendre();
    const cibles = [...p.panneau.querySelectorAll("button, input")].filter((n) => !n.disabled && !n.closest("[hidden]"));
    cibles.at(-1).focus();
    const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cibles[0]);
  });
});
