// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { creerDossier, creerSite, etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";

const appelerIa = vi.fn();
vi.mock("../../src/firebase/charger.js", () => ({
  chargerFirebase: async () => ({ appelerIa }),
}));
const { creerEcranRangement } = await import("../../src/ui/rangement/ecran.js");

const site = (id, titre, url) => creerSite({ id, titre, url, creeLe: 1 });
const dossier = (id, titre, items = []) => creerDossier({ id, titre, items, creeLe: 1 });
const vider = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function monter(grille, { compte = true } = {}) {
  const store = creerStore({ ...etatInitial(), grille }, reduire);
  const ecran = creerEcranRangement({ store, enCompte: () => compte });
  document.body.replaceChildren(ecran.racine);
  const q = (s) => ecran.racine.querySelector(s);
  const qa = (s) => [...ecran.racine.querySelectorAll(s)];
  const onglet = (i) => qa(".rangement-onglet")[i].click();
  return { store, ecran, q, qa, onglet };
}
const titres = (store) => store.lire().grille.map((e) => e.titre);

beforeEach(() => {
  appelerIa.mockReset();
  localStorage.clear();
});

describe("Ranger mes sites : doublons (sans IA)", () => {
  const grille = () => [
    site("a", "GitHub", "https://github.com"),
    dossier("d", "Dev", [site("b", "GitHub bis", "https://www.github.com/")]),
    site("c", "Autre", "https://autre.fr"),
  ];

  it("compte et liste les doublons, avec le chemin de chaque copie", () => {
    const m = monter(grille(), { compte: false });
    expect(m.qa(".rangement-onglet")[0].textContent).toBe("Doublons (1)");
    expect(m.q(".rangement-groupe-titre").textContent).toMatch(/Doublon exact/);
    expect(m.qa(".rangement-copies li").map((l) => l.querySelector("span").textContent)).toEqual([
      "« GitHub » — Accueil",
      "« GitHub bis » — Dev",
    ]);
  });

  it("« Garder celle-ci » : carte de confirmation avec la suppression listée, décochée", () => {
    const m = monter(grille());
    m.qa(".rangement-copies button")[0].click();
    const ligne = m.q(".chat-proposition-ligne--danger");
    expect(ligne.textContent).toMatch(/Supprimer « GitHub bis »/);
    expect(ligne.querySelector("input").checked).toBe(false);
    expect(titres(m.store)).toEqual(["GitHub", "Dev", "Autre"]);
  });

  it("cocher puis appliquer supprime l'autre copie ; le doublon disparaît de la liste", () => {
    const m = monter(grille());
    m.qa(".rangement-copies button")[0].click();
    m.q(".chat-proposition-ligne--danger input").click();
    m.q(".chat-proposition-appliquer").click();
    expect(m.store.lire().grille.find((e) => e.id === "d").items).toEqual([]);
    expect(m.qa(".rangement-onglet")[0].textContent).toBe("Doublons (0)");
    expect(m.q(".rangement-corps").textContent).toMatch(/Aucun doublon détecté/);
  });

  it("choisir une autre copie à garder change la proposition", () => {
    const m = monter(grille());
    m.qa(".rangement-copies button")[0].click();
    expect(m.q(".chat-proposition-ligne--danger").textContent).toMatch(/GitHub bis/);
    m.qa(".rangement-copies button")[1].click();
    expect(m.q(".chat-proposition-ligne--danger").textContent).toMatch(/Supprimer « GitHub »/);
  });
});

describe("Ranger mes sites : sites à vérifier", () => {
  const grille = () => [site("a", "A", "https://a.fr"), site("b", "B", "https://b.fr")];

  it("estimation avant, aucun appel tant qu'on ne le demande pas", () => {
    const m = monter(grille());
    m.onglet(1);
    expect(m.q(".rangement-corps").textContent).toMatch(/2 sites, environ/);
    expect(appelerIa).not.toHaveBeenCalled();
  });

  it("une erreur vue une fois : à confirmer, jamais de suppression proposée ; 403 : rien à conclure", async () => {
    appelerIa.mockResolvedValue({
      resultats: [
        { id: "a", statut: "introuvable", code: 404 },
        { id: "b", statut: "bloque", code: 403 },
      ],
    });
    const m = monter(grille());
    m.onglet(1);
    m.q(".bouton--principal").click();
    await vider();
    expect(appelerIa).toHaveBeenCalledWith("iaVerifierSites", { ids: ["a", "b"] });
    const texte = m.q(".rangement-corps").textContent;
    expect(texte).toMatch(/Page introuvable \(404\) \(1\)/);
    expect(texte).toMatch(/à confirmer par une seconde vérification/);
    expect(texte).toMatch(/Accès refusé ou limité : rien à conclure \(1\)/);
    expect(m.q(".bouton--danger")).toBeNull();
  });

  it("deuxième vérification confirmée 10 minutes plus tard : suppression proposable, avec carte", async () => {
    const maintenant = Date.now();
    localStorage.setItem(
      "nedotab.verifications",
      JSON.stringify({
        a: { statut: "introuvable", code: 404, vuLe: maintenant - 11 * 60_000, premierVu: maintenant - 11 * 60_000, confirme: false },
      }),
    );
    appelerIa.mockResolvedValue({ resultats: [{ id: "a", statut: "introuvable", code: 404 }] });
    const m = monter(grille());
    m.onglet(1);
    const revoir = m.qa(".rangement-boutons .bouton").find((b) => /Revérifier/.test(b.textContent));
    revoir.click();
    await vider();
    expect(appelerIa).toHaveBeenCalledWith("iaVerifierSites", { ids: ["a"] });
    m.q(".bouton--danger").click();
    expect(m.q(".chat-proposition-ligne--danger").textContent).toMatch(/Supprimer « A »/);
    expect(titres(m.store)).toEqual(["A", "B"]);
  });

  it("hors compte : pas d'appel", async () => {
    const m = monter(grille(), { compte: false });
    m.onglet(1);
    m.q(".bouton--principal").click();
    await vider();
    expect(appelerIa).not.toHaveBeenCalled();
  });
});

describe("Ranger mes sites : suggestions", () => {
  const grille = () => [
    site("a", "Booking", "https://booking.com"),
    site("b", "Skyscanner", "https://skyscanner.fr"),
    site("c", "GitHub", "https://github.com"),
  ];
  const groupes = [
    {
      titre: "Voyage",
      explication: "Regroupe les réservations.",
      proposition: { id: "p1", actions: [{ outil: "creer_dossier", titre: "Voyage", parent: null, sites: ["a", "b"] }] },
    },
    {
      titre: "Renommer",
      explication: "",
      proposition: { id: "p2", actions: [{ outil: "renommer", element: "c", titre: "Git" }] },
    },
  ];

  it("une carte par groupe, aucun « Tout appliquer », rien n'est appliqué tout seul", async () => {
    appelerIa.mockResolvedValue({ groupes });
    const m = monter(grille());
    m.onglet(2);
    m.q(".bouton--principal").click();
    await vider();
    expect(appelerIa).toHaveBeenCalledWith("iaSuggererRangement", { portee: "accueil" });
    expect(m.qa(".rangement-groupe").map((g) => g.querySelector("h3").textContent)).toEqual(["Voyage", "Renommer"]);
    expect(m.q(".rangement-corps").textContent).not.toMatch(/Tout appliquer/);
    expect(titres(m.store)).toEqual(["Booking", "Skyscanner", "GitHub"]);
  });

  it("valider groupe par groupe : appliquer le 1er, ignorer le 2e", async () => {
    appelerIa.mockResolvedValue({ groupes });
    const m = monter(grille());
    m.onglet(2);
    m.q(".bouton--principal").click();
    await vider();
    const [g1, g2] = m.qa(".rangement-groupe");
    g1.querySelector(".chat-proposition-appliquer").click();
    expect(titres(m.store)).toEqual(["GitHub", "Voyage"]);
    m.qa(".rangement-groupe")[1].querySelector(".chat-proposition-ignorer").click();
    expect(titres(m.store)).toEqual(["GitHub", "Voyage"]);
    expect(g2).toBeDefined();
  });

  it("erreur de l'assistant : message clair ; aucun groupe : « rien à ranger »", async () => {
    appelerIa.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { code: "ia-desactivee" } });
    const m = monter(grille());
    m.onglet(2);
    m.q(".bouton--principal").click();
    await vider();
    expect(m.q("[role=alert]").textContent).toMatch(/désactivé/);
    appelerIa.mockResolvedValueOnce({ groupes: [] });
    m.q(".bouton--principal").click();
    await vider();
    expect(m.q(".rangement-corps").textContent).toMatch(/Rien à ranger/);
  });
});
