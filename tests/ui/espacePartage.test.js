import { afterEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerEspacePartage } from "../../src/ui/espacePartage.js";

afterEach(() => document.body.replaceChildren());

/** Opens the "⋯" menu of the first card inside `racine`, then clicks the entry `nom`. */
function choisirDansMenu(racine, nom) {
  racine.querySelector(".partage-action--plus").click();
  [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === nom).click();
}

const attendre = () => new Promise((r) => setTimeout(r, 0));

function monter({ elements = [], compteur = 0, disponible = true, actif = () => true } = {}) {
  const store = creerStore(etatInitial(), reduire);
  let rappelElements = null;
  const appels = { ajout: [], remonter: [], supprimer: [], epingler: [] };
  const fb = {
    ecouterEspacePartage: (_uid, rappel) => {
      rappelElements = rappel;
      queueMicrotask(() =>
        rappel(elements, { depuisCache: false, enAttente: false, plein: false }),
      );
      return () => {};
    },
    ecouterCompteurPartage: (_uid, rappel) => {
      queueMicrotask(() => rappel(compteur));
      return () => {};
    },
    ajouterAuPartage: vi.fn(async (_u, e) => appels.ajout.push(e)),
    remonterPartage: vi.fn(async (_u, id) => appels.remonter.push(id)),
    supprimerDuPartage: vi.fn(async (_u, id) => appels.supprimer.push(id)),
    restaurerPartage: vi.fn(async () => {}),
    epinglerPartage: vi.fn(async (_u, id, v) => appels.epingler.push([id, v])),
  };
  const p = creerEspacePartage({
    store,
    disponible: () => disponible,
    actif,
    charger: vi.fn(async () => fb),
    uid: () => "u1",
    copier: vi.fn(async () => {}),
  });
  document.body.append(p.bouton, p.panneau);
  p.actualiser();
  return {
    p,
    fb,
    appels,
    pousser: (e) => rappelElements?.(e, { depuisCache: false, enAttente: false, plein: false }),
  };
}

const el_ = (over) => ({
  id: "1",
  type: "texte",
  contenu: "bonjour",
  titre: "b",
  appareil: "iphone",
  epingle: false,
  creeLe: Date.now() - 60_000,
  enAttente: false,
  ...over,
});

describe("panneau de l'espace de partage (V4.24)", () => {
  it("le bouton n'apparaît que si le compte est utilisable", () => {
    const { p } = monter({ disponible: false });
    expect(p.bouton.hidden).toBe(true);
    const { p: p2 } = monter();
    expect(p2.bouton.hidden).toBe(false);
  });

  it("réglage désactivé (T8) : bouton caché, aucune écoute, réapparaît à la réactivation", async () => {
    let actif = false;
    const ecoute = vi.fn();
    const store = creerStore(etatInitial(), reduire);
    const charger = vi.fn(async () => ({
      ecouterEspacePartage: (...a) => {
        ecoute(...a);
        return () => {};
      },
      ecouterCompteurPartage: () => () => {},
    }));
    const p = creerEspacePartage({
      store,
      disponible: () => true,
      actif: () => actif,
      charger,
      uid: () => "u1",
      copier: vi.fn(async () => {}),
    });
    document.body.append(p.bouton, p.panneau);
    p.actualiser();
    await attendre();
    expect(p.bouton.hidden).toBe(true);
    expect(charger).not.toHaveBeenCalled(); // no Firestore / Storage request while off
    p.ouvrir();
    expect(p.estOuvert()).toBe(false);
    actif = true;
    p.actualiser();
    await attendre();
    expect(p.bouton.hidden).toBe(false);
    expect(ecoute).toHaveBeenCalled();
  });

  it("réglage désactivé pendant que le panneau est ouvert : il se ferme et l'écoute s'arrête", async () => {
    let actif = true;
    const arret = vi.fn();
    const store = creerStore(etatInitial(), reduire);
    const p = creerEspacePartage({
      store,
      disponible: () => true,
      actif: () => actif,
      charger: async () => ({
        ecouterEspacePartage: () => arret,
        ecouterCompteurPartage: () => arret,
      }),
      uid: () => "u1",
      copier: vi.fn(async () => {}),
    });
    document.body.append(p.bouton, p.panneau);
    p.actualiser();
    await attendre();
    p.ouvrir();
    expect(p.estOuvert()).toBe(true);
    actif = false;
    p.actualiser();
    expect(p.estOuvert()).toBe(false);
    expect(p.bouton.hidden).toBe(true);
    expect(arret).toHaveBeenCalled();
  });

  it("état vide : message d'invitation", async () => {
    const { p } = monter();
    p.ouvrir();
    await attendre();
    expect(p.panneau.textContent).toContain("Envoyez un texte ou un lien d'un appareil à l'autre.");
    expect(p.panneau.textContent).toContain("Aucun élément");
  });

  it("chargement : trois cartes squelettes avant la première réponse", () => {
    const { p } = monter();
    p.ouvrir();
    expect(p.panneau.querySelectorAll(".partage-squelette")).toHaveLength(3);
  });

  it("sécurité : du HTML est affiché comme du texte, jamais interprété", async () => {
    const piege = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
    const { p } = monter({ elements: [el_({ contenu: piege })] });
    p.ouvrir();
    await attendre();
    expect(p.panneau.querySelector("img")).toBeNull();
    expect(p.panneau.querySelector("script")).toBeNull();
    expect(p.panneau.querySelector(".partage-apercu").textContent).toContain("<img src=x");
    expect(window.__xss).toBeUndefined();
  });

  it("sécurité : javascript: n'est pas cliquable, https l'est avec noopener noreferrer", async () => {
    const { p } = monter({
      elements: [
        el_({ id: "a", type: "lien", contenu: "javascript:alert(1)" }),
        el_({ id: "b", type: "lien", contenu: "https://exemple.fr/page" }),
      ],
    });
    p.ouvrir();
    await attendre();
    const liens = [...p.panneau.querySelectorAll("a[href]")];
    expect(liens.every((a) => /^https?:/.test(a.href))).toBe(true);
    expect(liens.some((a) => a.href.startsWith("javascript:"))).toBe(false);
    for (const a of liens) {
      expect(a.target).toBe("_blank");
      expect(a.rel).toBe("noopener noreferrer");
    }
    expect(p.panneau.querySelector('[data-id="a"]').textContent).toContain("javascript:alert(1)");
  });

  it("envoi : un texte part, le champ est vidé ; un doublon remonte l'existant", async () => {
    const { p, appels } = monter({ elements: [el_({ id: "x", contenu: "déjà là" })] });
    p.ouvrir();
    await attendre();
    const champ = p.panneau.querySelector("textarea");
    champ.value = "nouveau texte";
    champ.dispatchEvent(new Event("input"));
    [...p.panneau.querySelectorAll("button")].find((b) => b.textContent === "Envoyer").click();
    await attendre();
    await attendre();
    expect(appels.ajout[0]).toMatchObject({ type: "texte", contenu: "nouveau texte" });
    expect(champ.value).toBe("");
    champ.value = "déjà là";
    [...p.panneau.querySelectorAll("button")].find((b) => b.textContent === "Envoyer").click();
    await attendre();
    await attendre();
    expect(appels.remonter).toEqual(["x"]);
    expect(appels.ajout).toHaveLength(1);
  });

  it("contenu trop long : message AVANT l'envoi, aucun appel", async () => {
    const { p, appels } = monter();
    p.ouvrir();
    await attendre();
    p.panneau.querySelector("textarea").value = "x".repeat(20001);
    [...p.panneau.querySelectorAll("button")].find((b) => b.textContent === "Envoyer").click();
    await attendre();
    expect(appels.ajout).toHaveLength(0);
    expect(p.panneau.textContent).toMatch(/20\s?000 au maximum/);
  });

  it("limite atteinte : message clair et aucun envoi", async () => {
    const { p, appels } = monter({ compteur: 200 });
    p.ouvrir();
    await attendre();
    await attendre();
    p.panneau.querySelector("textarea").value = "encore";
    [...p.panneau.querySelectorAll("button")].find((b) => b.textContent === "Envoyer").click();
    await attendre();
    expect(appels.ajout).toHaveLength(0);
    expect(p.panneau.textContent).toContain("200 éléments maximum — supprimez-en pour continuer.");
  });

  it("copier : retour « Copié ✓ »", async () => {
    const { p } = monter({ elements: [el_()] });
    p.ouvrir();
    await attendre();
    const b = [...p.panneau.querySelectorAll("button")].find((x) => x.textContent === "Copier");
    b.click();
    await attendre();
    expect(b.textContent).toBe("Copié ✓");
  });

  it("supprimer : un toast avec « Annuler », et l'élément est restauré au clic", async () => {
    const { p, appels, fb } = monter({ elements: [el_()] });
    p.ouvrir();
    await attendre();
    choisirDansMenu(p.panneau, "Supprimer");
    await attendre();
    await attendre();
    expect(appels.supprimer).toEqual(["1"]);
    const annuler = [...document.querySelectorAll("button")].find(
      (x) => x.textContent === "Annuler",
    );
    expect(annuler).toBeTruthy();
    annuler.click();
    await attendre();
    expect(fb.restaurerPartage).toHaveBeenCalled();
  });

  it("épingler", async () => {
    const { p, appels } = monter({ elements: [el_()] });
    p.ouvrir();
    await attendre();
    choisirDansMenu(p.panneau, "Épingler");
    await attendre();
    await attendre();
    expect(appels.epingler).toEqual([["1", true]]);
  });

  it("Échap ferme et rend le focus ; Tab reste dans le panneau", async () => {
    const { p } = monter();
    p.bouton.focus();
    p.ouvrir();
    await attendre();
    // V4.30: the vault box is an input of the composer, inside the loop too.
    const cibles = [
      ...p.panneau.querySelectorAll("button, a[href], textarea, input:not([type=file])"),
    ].filter((n) => !n.disabled && !n.closest("[hidden]") && n.tabIndex >= 0);
    cibles.at(-1).focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cibles[0]);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(p.panneau.hidden).toBe(true);
    expect(document.activeElement).toBe(p.bouton);
  });

  it("hors ligne : bandeau d'information", async () => {
    const { p } = monter();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    p.ouvrir();
    await attendre();
    expect(p.panneau.textContent).toContain("Hors ligne — vos envois partiront à la reconnexion.");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("erreur de lecture : « Réessayer »", async () => {
    const store = creerStore(etatInitial(), reduire);
    let essais = 0;
    const fb = {
      ecouterEspacePartage: (_u, ok, erreur) => {
        essais++;
        if (essais === 1) queueMicrotask(() => erreur(new Error("x")));
        else queueMicrotask(() => ok([], { plein: false }));
        return () => {};
      },
      ecouterCompteurPartage: () => () => {},
    };
    const p = creerEspacePartage({
      store,
      disponible: () => true,
      charger: async () => fb,
      uid: () => "u",
    });
    document.body.append(p.bouton, p.panneau);
    p.ouvrir();
    await attendre();
    await attendre();
    const reessayer = [...p.panneau.querySelectorAll("button")].find(
      (x) => x.textContent === "Réessayer",
    );
    expect(reessayer).toBeTruthy();
    reessayer.click();
    await attendre();
    await attendre();
    expect(essais).toBe(2);
  });
});
