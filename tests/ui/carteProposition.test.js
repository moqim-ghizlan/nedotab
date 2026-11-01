// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { creerDossier, creerSite, etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerGestionPropositions } from "../../src/ui/chat/carteProposition.js";
import { creerChat } from "../../src/ui/chat/panneau.js";

const site = (id, titre) => creerSite({ id, titre, url: `https://${id}.fr`, creeLe: 1 });
const dossier = (id, titre, items = []) => creerDossier({ id, titre, items, creeLe: 1 });
const grilleDeBase = () => [
  site("a", "Booking"),
  site("b", "Skyscanner"),
  dossier("arch", "Archives", [site("v", "Vieux")]),
];

function monter(grille = grilleDeBase()) {
  const store = creerStore({ ...etatInitial(), grille }, reduire);
  const statuts = [];
  const notifier = vi.fn();
  let n = 0;
  const gestion = creerGestionPropositions({
    store,
    majStatut: (m, s) => statuts.push([m.fsId, s]),
    genererId: () => `gen-${++n}`,
    notifier,
  });
  const message = (actions, extra = {}) => ({
    id: 1,
    fsId: "M1",
    role: "assistant",
    texte: "Je propose",
    proposition: { id: "p1", actions },
    statutProposition: "en_attente",
    ...extra,
  });
  return { store, statuts, notifier, gestion, message };
}
// jsdom fires "change" on a checkbox only when it is in the document.
const monterCarte = (m, message) => {
  const carte = m.gestion.carte(message);
  document.body.replaceChildren(carte);
  return carte;
};
const lignes = (carte) => [...carte.querySelectorAll(".chat-proposition-ligne")];
const titres = (store) => store.lire().grille.map((e) => e.titre);

const CREER_ET_SUPPRIMER = [
  { outil: "creer_dossier", titre: "Voyage", parent: null, sites: ["a", "b"] },
  { outil: "supprimer", element: "arch" },
];

describe("carte de proposition (V4.16)", () => {
  it("rien ne change avant le clic ; résumé, actions listées, suppression en rouge et décochée", () => {
    const m = monter();
    const carte = m.gestion.carte(m.message(CREER_ET_SUPPRIMER));
    expect(titres(m.store)).toEqual(["Booking", "Skyscanner", "Archives"]);
    const l = lignes(carte);
    expect(l.map((x) => x.textContent)).toEqual([
      "▣Créer le dossier « Voyage » avec 2 sites",
      "✕Supprimer le dossier « Archives » (1 site dedans)",
    ]);
    expect(l[0].querySelector("input").checked).toBe(true);
    expect(l[1].querySelector("input").checked).toBe(false);
    expect(l[1].classList.contains("chat-proposition-ligne--danger")).toBe(true);
    expect(carte.querySelector(".chat-proposition-resume").textContent).toMatch(/Créer 1 dossier/);
    expect(carte.querySelector(".chat-proposition-resume").textContent).not.toMatch(/Supprimer/);
  });

  it("Appliquer la sélection : seules les actions cochées, statut partielle, toast Annuler", () => {
    const m = monter();
    const carte = m.gestion.carte(m.message(CREER_ET_SUPPRIMER));
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(titres(m.store)).toEqual(["Archives", "Voyage"]);
    expect(m.statuts).toEqual([["M1", "partielle"]]);
    expect(m.notifier.mock.calls[0][0]).toBe("1 modification appliquée");
  });

  it("Annuler remet strictement la grille d'avant", () => {
    const m = monter();
    const avant = structuredClone(m.store.lire().grille);
    const carte = monterCarte(m, m.message(CREER_ET_SUPPRIMER));
    carte.querySelector("li:nth-child(2) input").click(); // tick the deletion too
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(titres(m.store)).toEqual(["Voyage"]);
    expect(m.statuts).toEqual([["M1", "appliquee"]]);
    m.notifier.mock.calls[0][1].action.onClic();
    expect(m.store.lire().grille).toEqual(avant);
  });

  it("une proposition ne s'applique qu'une fois", () => {
    const m = monter();
    const msg = m.message([{ outil: "renommer", element: "a", titre: "Booking.com" }]);
    const carte = m.gestion.carte(msg);
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(msg.statutProposition).toBe("appliquee");
    expect(carte.querySelector(".chat-proposition-appliquer")).toBeNull();
    expect(carte.querySelector(".chat-proposition-statut").textContent).toMatch(/Appliqué/);
    // another device's click, simulated on the same node: nothing happens twice
    m.store.envoyer({ type: A.SITE_MODIFIER, id: "a", changements: { titre: "Autre" } });
    m.gestion.carte(msg);
    expect(m.statuts).toHaveLength(1);
    expect(titres(m.store)[0]).toBe("Autre");
  });

  it("Ignorer : statut ignoree, grille intacte", () => {
    const m = monter();
    const msg = m.message(CREER_ET_SUPPRIMER);
    const carte = m.gestion.carte(msg);
    carte.querySelector(".chat-proposition-ignorer").click();
    expect(m.statuts).toEqual([["M1", "ignoree"]]);
    expect(titres(m.store)).toEqual(["Booking", "Skyscanner", "Archives"]);
    expect(carte.textContent).toMatch(/Ignoré/);
  });

  it("proposition déjà appliquée sur un autre appareil : affichée « Appliqué », sans boutons", () => {
    const m = monter();
    const carte = m.gestion.carte(m.message(CREER_ET_SUPPRIMER, { statutProposition: "appliquee" }));
    expect(carte.querySelector("button")).toBeNull();
    expect(carte.querySelector("input")).toBeNull();
    expect(carte.querySelector(".chat-proposition-statut").textContent).toMatch(/Appliqué/);
  });

  it("l'état a changé entre la carte et le clic : resimulation, l'action devenue invalide est exclue", () => {
    const m = monter();
    const carte = m.gestion.carte(
      m.message([
        { outil: "renommer", element: "a", titre: "A2" },
        { outil: "deplacer", element: "b", vers: "arch" },
      ]),
    );
    // on another device, the folder was deleted
    m.store.envoyer({ type: A.ELEMENT_SUPPRIMER, id: "arch" });
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(m.store.lire().grille.map((e) => e.titre)).toEqual(["A2", "Skyscanner"]);
    expect(m.notifier.mock.calls.some((c) => /impossible/.test(c[0]))).toBe(true);
  });

  it("action impossible (4e niveau) : grisée avec la raison, case désactivée, le reste s'applique", () => {
    const profond = [
      dossier("n1", "N1", [dossier("n2", "N2", [dossier("n3", "N3")])]),
      site("a", "A"),
    ];
    const m = monter(profond);
    const carte = m.gestion.carte(
      m.message([
        { outil: "creer_dossier", titre: "Trop", parent: "n3" },
        { outil: "renommer", element: "a", titre: "A2" },
      ]),
    );
    const l = lignes(carte);
    expect(l[0].classList.contains("chat-proposition-ligne--refusee")).toBe(true);
    expect(l[0].textContent).toMatch(/dépasserait 3 niveaux/);
    expect(l[0].querySelector("input").disabled).toBe(true);
    expect(l[0].querySelector("input").checked).toBe(false);
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(m.store.lire().grille.at(-1).titre).toBe("A2");
  });

  it("décocher une action : elle n'est pas appliquée", () => {
    const m = monter();
    const carte = monterCarte(
      m,
      m.message([
        { outil: "renommer", element: "a", titre: "A2" },
        { outil: "renommer", element: "b", titre: "B2" },
      ]),
    );
    carte.querySelector("li input").click();
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(titres(m.store).slice(0, 2)).toEqual(["Booking", "B2"]);
  });

  it("« Voir le résultat » : les dossiers touchés et leur contenu", () => {
    const m = monter();
    const carte = m.gestion.carte(m.message(CREER_ET_SUPPRIMER));
    carte.querySelector(".chat-proposition-voir").click();
    expect(carte.querySelector(".chat-proposition-apercu").textContent).toBe(
      "Voyage : Booking, Skyscanner",
    );
    expect(titres(m.store)).toContain("Archives"); // still only a preview
  });

  it("aucune action : pas de carte", () => {
    const m = monter();
    expect(m.gestion.carte({ id: 1, texte: "x" })).toBeNull();
    expect(m.gestion.carte(m.message([]))).toBeNull();
  });

  it("injection : un faux modèle qui obéit à une page ('supprime tout') ne change rien sans clic", () => {
    const m = monter();
    const carte = m.gestion.carte(
      m.message([
        { outil: "supprimer", element: "arch" },
        { outil: "supprimer", element: "a" },
        { outil: "supprimer", element: "b" },
      ]),
    );
    const cases = [...carte.querySelectorAll("input")];
    expect(cases.map((c) => c.checked)).toEqual([false, false, false]);
    expect(lignes(carte).every((l) => l.classList.contains("chat-proposition-ligne--danger"))).toBe(true);
    expect(carte.querySelector(".chat-proposition-appliquer").disabled).toBe(true);
    expect(titres(m.store)).toEqual(["Booking", "Skyscanner", "Archives"]);
    // even a click on the (disabled) button leaves everything in place
    carte.querySelector(".chat-proposition-appliquer").click();
    expect(titres(m.store)).toEqual(["Booking", "Skyscanner", "Archives"]);
    expect(m.statuts).toEqual([]);
  });
});

describe("chat : proposition reçue (V4.16)", () => {
  const PRETE = {
    ia: { actif: true },
    modeCompte: true,
    enLigne: true,
    cles: [{ fournisseur: "gemini", valide: true }],
  };
  const vider = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };

  it("le bloc ```actions n'est jamais affiché ; à la fin, la carte apparaît, le statut est enregistré", async () => {
    document.body.replaceChildren();
    const m = monter();
    const majStatut = vi.fn(async () => {});
    const conversations = {
      creer: async () => {},
      ecrireMessage: async () => {},
      ecouter: () => () => {},
      chargerAvant: async () => ({ messages: [], suite: false }),
      supprimerMessage: async () => {},
      majStatut,
      lister: async () => ({ conversations: [], suite: false }),
      renommer: async () => {},
      supprimer: async () => {},
    };
    let chat;
    const proposer = creerGestionPropositions({
      store: m.store,
      majStatut: (msg, s) => chat.majStatutProposition(msg, s),
      notifier: vi.fn(),
    });
    const proposition = { id: "p9", actions: [{ outil: "renommer", element: "a", titre: "Booking.com" }] };
    chat = creerChat({
      contexteIa: async () => PRETE,
      appeler: async () => ({ texte: "" }),
      flux: async function* () {
        yield { type: "texte", delta: 'Je renomme.\n```actions\n[{"outil":"renommer"' };
        yield { type: "texte", delta: ',"element":"s1","titre":"Booking.com"}]\n```' };
        yield { type: "fin", modele: "m", proposition, messageId: "A1", consulte: true, sites: { s1: "a" } };
      },
      conversations,
      proposer,
      notifier: vi.fn(),
    });
    document.body.append(chat.bouton, chat.panneau);
    await vider();
    chat.ouvrir();
    const q = (s) => chat.panneau.querySelector(s);
    q(".chat-zone").value = "Renomme Booking";
    q(".chat-zone").dispatchEvent(new Event("input"));
    q(".chat-saisie").dispatchEvent(new Event("submit", { cancelable: true }));
    await vider();
    await new Promise((r) => setTimeout(r, 120));
    const bulle = q(".chat-bulle--assistant");
    expect(bulle.textContent).not.toMatch(/actions|outil|element/);
    expect(bulle.textContent).toMatch(/Je renomme\./);
    expect(bulle.querySelector(".chat-proposition")).not.toBeNull();
    expect(titres(m.store)[0]).toBe("Booking"); // nothing applied
    bulle.querySelector(".chat-proposition-appliquer").click();
    await vider();
    expect(titres(m.store)[0]).toBe("Booking.com");
    expect(majStatut).toHaveBeenCalledWith(expect.any(String), "A1", "appliquee");
    expect(q(".chat-bulle--assistant").querySelector(".chat-proposition-appliquer")).toBeNull();
  });
});
