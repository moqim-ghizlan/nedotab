// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { creerChat } from "../../src/ui/chat/panneau.js";
import { creerHistorique, DELAI_SUPPRESSION_MS } from "../../src/ui/chat/historique.js";

const PRETE = {
  ia: { actif: true },
  modeCompte: true,
  enLigne: true,
  cles: [{ fournisseur: "gemini", valide: true }],
};
const vider = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const attendre = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const doc = (id, role, texte, creeLe, extra = {}) => ({ id, role, texte, creeLe, etat: "ok", ...extra });

/** A fake of the conversation service: records the calls and lets the test push snapshots. */
function service({ echecEcriture = false } = {}) {
  const s = {
    appels: [],
    rappel: null,
    arrets: 0,
    creer: vi.fn(async (c) => void s.appels.push(["creer", c])),
    ecrireMessage: vi.fn(async (convId, m) => {
      if (echecEcriture) throw Object.assign(new Error("refus"), { code: "permission-denied" });
      s.appels.push(["ecrire", convId, m]);
    }),
    ecouter: vi.fn((convId, rappel) => {
      s.appels.push(["ecouter", convId]);
      s.rappel = rappel;
      return () => s.arrets++;
    }),
    chargerAvant: vi.fn(async () => ({ messages: [], suite: false })),
    supprimerMessage: vi.fn(async () => {}),
    lister: vi.fn(async () => ({ conversations: [], suite: false })),
    renommer: vi.fn(async () => {}),
    supprimer: vi.fn(async () => {}),
  };
  return s;
}

async function monter({ reponses = [], conv = service() } = {}) {
  document.body.replaceChildren();
  const entrees = [];
  const flux = async function* (entree) {
    entrees.push(entree);
    for (const e of reponses.shift() ?? []) yield e;
  };
  const chat = creerChat({
    contexteIa: async () => PRETE,
    appeler: async () => ({ texte: "" }),
    flux,
    conversations: conv,
    notifier: vi.fn(),
  });
  document.body.append(chat.bouton, chat.panneau);
  await vider();
  chat.ouvrir();
  const q = (s) => chat.panneau.querySelector(s);
  const qa = (s) => [...chat.panneau.querySelectorAll(s)];
  const poser = async (texte) => {
    q(".chat-zone").value = texte;
    q(".chat-zone").dispatchEvent(new Event("input"));
    q(".chat-saisie").dispatchEvent(new Event("submit", { cancelable: true }));
    await vider();
    await attendre();
  };
  return { chat, conv, q, qa, poser, entrees };
}
const textes = (m) => m.qa(".chat-bulle").map((b) => b.textContent);

afterEach(() => vi.useRealTimers());

describe("chat : conversation enregistrée (V4.15)", () => {
  it("1re question : conversation créée (titre = premiers mots), message écrit, le serveur reçoit l'id seulement", async () => {
    const m = await monter({
      reponses: [[{ type: "texte", delta: "Voilà." }, { type: "fin", messageId: "A1" }]],
    });
    await m.poser("Comment configurer un serveur DNS sur mon routeur ?");
    const [creer, ecouter, ecrire] = m.conv.appels;
    expect(creer[0]).toBe("creer");
    expect(creer[1].titre).toBe("Comment configurer un serveur DNS sur");
    expect(creer[1].id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(ecrire).toEqual([
      "ecrire",
      creer[1].id,
      { id: expect.stringMatching(/^\d{13}-[0-9a-f]{8}$/), texte: "Comment configurer un serveur DNS sur mon routeur ?", origine: null },
    ]);
    expect(ecouter).toEqual(["ecouter", creer[1].id]);
    expect(m.entrees).toEqual([creer[1].id]); // an id, never a history
    expect(m.chat.idConversation()).toBe(creer[1].id);
  });

  it("2e question : même conversation, pas de nouvelle création", async () => {
    const m = await monter({
      reponses: [
        [{ type: "texte", delta: "R1" }, { type: "fin", messageId: "A1" }],
        [{ type: "texte", delta: "R2" }, { type: "fin", messageId: "A2" }],
      ],
    });
    await m.poser("Première");
    await m.poser("Seconde");
    expect(m.conv.creer).toHaveBeenCalledTimes(1);
    expect(m.conv.ecrireMessage).toHaveBeenCalledTimes(2);
    expect(m.entrees[0]).toBe(m.entrees[1]);
  });

  it("la même conversation relue depuis Firestore ne duplique rien", async () => {
    const m = await monter({
      reponses: [[{ type: "texte", delta: "Voilà." }, { type: "fin", messageId: "A1" }]],
    });
    await m.poser("Bonjour");
    const idUser = m.conv.ecrireMessage.mock.calls[0][1].id;
    m.conv.rappel([
      doc(idUser, "user", "Bonjour", 1000),
      doc("A1", "assistant", "Voilà.", 2000),
    ]);
    expect(textes(m).filter((t) => t.includes("Bonjour"))).toHaveLength(1);
    expect(textes(m).filter((t) => t.includes("Voilà."))).toHaveLength(1);
  });

  it("messages écrits depuis un autre appareil : ajoutés en temps réel, dans l'ordre", async () => {
    const m = await monter({
      reponses: [[{ type: "texte", delta: "R1" }, { type: "fin", messageId: "A1" }]],
    });
    await m.poser("Q1");
    const idUser = m.conv.ecrireMessage.mock.calls[0][1].id;
    m.conv.rappel([
      doc(idUser, "user", "Q1", 1000),
      doc("A1", "assistant", "R1", 2000),
      doc("U2", "user", "Question depuis l'iPhone", 3000),
      doc("A2", "assistant", "Réponse à l'iPhone", 4000),
    ]);
    const t = textes(m);
    expect(t.at(-2)).toContain("Question depuis l'iPhone");
    expect(t.at(-1)).toContain("Réponse à l'iPhone");
  });

  it("écriture refusée : message en erreur, aucune réponse demandée, réessayer écrit de nouveau", async () => {
    const conv = service({ echecEcriture: true });
    const m = await monter({
      conv,
      reponses: [[{ type: "texte", delta: "R" }, { type: "fin", messageId: "A1" }]],
    });
    await m.poser("Bonjour");
    expect(m.entrees).toHaveLength(0);
    expect(m.q(".chat-echec")).not.toBeNull();
    expect(m.q(".chat-saisie button[type=submit], .chat-envoyer")?.disabled ?? false).toBe(false);
  });

  it("réponse arrêtée au milieu : le message stocké (interrompu) remplace le provisoire, sans doublon", async () => {
    const m = await monter({
      reponses: [[{ type: "texte", delta: "Le DNS traduit" }, { type: "enregistre", messageId: "A1" }]],
    });
    await m.poser("Explique le DNS");
    const idUser = m.conv.ecrireMessage.mock.calls[0][1].id;
    m.conv.rappel([
      doc(idUser, "user", "Explique le DNS", 1000),
      doc("A1", "assistant", "Le DNS traduit", 2000, { etat: "interrompu" }),
    ]);
    expect(textes(m).filter((t) => t.includes("Le DNS traduit"))).toHaveLength(1);
  });

  it("nouvelle conversation : l'écoute s'arrête, la suivante repart de zéro", async () => {
    const m = await monter({
      reponses: [
        [{ type: "texte", delta: "R1" }, { type: "fin", messageId: "A1" }],
        [{ type: "texte", delta: "R2" }, { type: "fin", messageId: "A2" }],
      ],
    });
    await m.poser("Première");
    const premiere = m.chat.idConversation();
    m.q(".chat-entete-bouton").click(); // "Nouvelle conversation"
    await vider();
    expect(m.conv.arrets).toBe(1);
    expect(m.chat.idConversation()).toBeNull();
    await m.poser("Autre sujet");
    expect(m.chat.idConversation()).not.toBe(premiere);
    expect(m.conv.creer).toHaveBeenCalledTimes(2);
  });
});

describe("chat : historique (V4.15)", () => {
  const conversations = [
    { id: "c-aaaaaaaa", titre: "Mon DNS", apercu: "Le DNS traduit", nbMessages: 4, majLe: Date.now() - 3600_000 },
    { id: "c-bbbbbbbb", titre: "Recettes", apercu: "Voir Marmiton", nbMessages: 2, majLe: Date.now() - 86400_000 * 2 },
  ];

  it("liste, ouverture d'une conversation : ses messages s'affichent, l'écoute démarre", async () => {
    const conv = service();
    conv.lister = vi.fn(async () => ({ conversations, suite: false }));
    const m = await monter({ conv });
    m.q(".chat-historique-bouton").click();
    await vider();
    const lignes = m.qa(".chat-historique-ligne");
    expect(lignes.map((l) => l.querySelector(".chat-historique-titre").textContent)).toEqual([
      "Mon DNS",
      "Recettes",
    ]);
    expect(lignes[0].textContent).toMatch(/il y a 1 h · 4 messages/);
    lignes[0].querySelector(".chat-historique-ouvrir").click();
    expect(m.chat.idConversation()).toBe("c-aaaaaaaa");
    expect(conv.ecouter).toHaveBeenCalledWith("c-aaaaaaaa", expect.any(Function));
    conv.rappel([
      doc("U1", "user", "C'est quoi le DNS ?", 1000),
      doc("A1", "assistant", "Le DNS traduit les noms.", 2000),
    ]);
    expect(textes(m).some((t) => t.includes("Le DNS traduit les noms."))).toBe(true);
    expect(m.q(".chat-historique").hidden).toBe(true);
  });

  it("plus de 50 messages : bouton « Charger les messages précédents »", async () => {
    const conv = service();
    conv.lister = vi.fn(async () => ({ conversations, suite: false }));
    conv.chargerAvant = vi.fn(async () => ({
      messages: [doc("U0", "user", "Tout premier message", 10)],
      suite: false,
    }));
    const m = await monter({ conv });
    m.q(".chat-historique-bouton").click();
    await vider();
    m.qa(".chat-historique-ouvrir")[0].click();
    const docs = Array.from({ length: 50 }, (_, i) =>
      doc(`M${String(i).padStart(2, "0")}`, i % 2 ? "assistant" : "user", `msg ${i}`, 1000 + i),
    );
    conv.rappel(docs);
    const bouton = m.q(".chat-precedents");
    expect(bouton).not.toBeNull();
    bouton.click();
    await vider();
    expect(conv.chargerAvant).toHaveBeenCalledWith("c-aaaaaaaa", 1000);
    expect(textes(m)[0]).toContain("Tout premier message");
    expect(m.q(".chat-precedents")).toBeNull();
  });
});

describe("historique : renommer et supprimer", () => {
  it("renommer avec le crayon : titre enregistré ; Échap annule", async () => {
    const renommer = vi.fn(async () => {});
    const h = creerHistorique({
      lister: async () => ({
        conversations: [{ id: "c1", titre: "Ancien", apercu: "", nbMessages: 1, majLe: Date.now() }],
        suite: false,
      }),
      renommer,
      supprimer: async () => {},
      surOuvrir: () => {},
      surNouvelle: () => {},
    });
    document.body.append(h.racine);
    await h.ouvrir();
    h.racine.querySelector(".chat-historique-action").click();
    const champ = h.racine.querySelector(".chat-historique-champ");
    champ.value = "  Nouveau   titre ";
    champ.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vider();
    expect(renommer).toHaveBeenCalledWith("c1", "Nouveau titre");
    expect(h.racine.querySelector(".chat-historique-titre").textContent).toBe("Nouveau titre");

    h.racine.querySelector(".chat-historique-action").click();
    const champ2 = h.racine.querySelector(".chat-historique-champ");
    champ2.value = "Autre";
    champ2.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vider();
    expect(renommer).toHaveBeenCalledTimes(1);
  });

  it("supprimer : masquée tout de suite, supprimée après 5 s, « Annuler » la garde", async () => {
    vi.useFakeTimers();
    const supprimer = vi.fn(async () => {});
    const surSupprimee = vi.fn();
    const conv = (id) => ({ id, titre: id, apercu: "", nbMessages: 1, majLe: Date.now() });
    const h = creerHistorique({
      lister: async () => ({ conversations: [conv("c1"), conv("c2")], suite: false }),
      renommer: async () => {},
      supprimer,
      surSupprimee,
      surOuvrir: () => {},
      surNouvelle: () => {},
    });
    document.body.append(h.racine);
    await h.ouvrir();
    const supprimerBoutons = () => h.racine.querySelectorAll(".chat-historique-supprimer");
    supprimerBoutons()[0].click();
    expect(h.racine.querySelectorAll(".chat-historique-ligne")).toHaveLength(1);
    expect(supprimer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DELAI_SUPPRESSION_MS + 10);
    expect(supprimer).toHaveBeenCalledWith("c1");
    expect(surSupprimee).toHaveBeenCalledWith("c1");

    // second one: undone
    supprimerBoutons()[0].click();
    document.querySelector(".toast-action").click();
    await vi.advanceTimersByTimeAsync(DELAI_SUPPRESSION_MS + 10);
    expect(supprimer).toHaveBeenCalledTimes(1);
    expect(h.racine.querySelectorAll(".chat-historique-ligne")).toHaveLength(1);
  });

  it("liste vide et erreur de lecture : message clair", async () => {
    const h = creerHistorique({
      lister: async () => ({ conversations: [], suite: false }),
      renommer: async () => {},
      supprimer: async () => {},
      surOuvrir: () => {},
      surNouvelle: () => {},
    });
    document.body.append(h.racine);
    await h.ouvrir();
    expect(h.racine.querySelector(".chat-historique-etat").textContent).toMatch(/Aucune conversation/);
    expect(h.racine.textContent).toMatch(/au-delà de 100/);
    const e = creerHistorique({
      lister: async () => {
        throw new Error("hors ligne");
      },
      renommer: async () => {},
      supprimer: async () => {},
      surOuvrir: () => {},
      surNouvelle: () => {},
    });
    document.body.append(e.racine);
    await e.ouvrir();
    expect(e.racine.querySelector(".chat-historique-etat").textContent).toMatch(/indisponible/);
  });
});
