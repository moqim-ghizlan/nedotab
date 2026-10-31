import { describe, expect, it, vi } from "vitest";
import { creerChat } from "../../src/ui/chat/panneau.js";

const PRETE = {
  ia: { actif: true },
  modeCompte: true,
  enLigne: true,
  cles: [{ fournisseur: "gemini", valide: true }],
};

async function monter(contexte = PRETE, extra = {}) {
  document.body.replaceChildren();
  document.documentElement.classList.remove("chat-ouvert");
  const appels = [];
  const chat = creerChat({
    contexteIa: async () => contexte,
    appeler: async (messages) => {
      appels.push(messages);
      return { texte: `Réponse ${appels.length} avec **gras**`, modele: "gemini-x" };
    },
    ouvrirReglagesIa: vi.fn(),
    confirmer: async () => true,
    copier: vi.fn(async () => {}),
    notifier: vi.fn(),
    ...extra,
  });
  document.body.append(chat.bouton, chat.panneau);
  await Promise.resolve();
  await Promise.resolve();
  const q = (s) => chat.panneau.querySelector(s);
  const ecrire = (texte) => {
    q(".chat-zone").value = texte;
    q(".chat-zone").dispatchEvent(new Event("input"));
  };
  const envoyer = () => q(".chat-saisie").dispatchEvent(new Event("submit", { cancelable: true }));
  const clavier = (init, cible = document) =>
    cible.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  return {
    chat,
    appels,
    q,
    ecrire,
    envoyer,
    clavier,
    qa: (s) => [...chat.panneau.querySelectorAll(s)],
  };
}

describe("chat : bouton robot et ouverture (V4.11)", () => {
  it("IA prête : bouton visible avec son nom ; panneau fermé", async () => {
    const m = await monter();
    expect(m.chat.bouton.hidden).toBe(false);
    expect(m.chat.bouton.getAttribute("aria-label")).toBe("Ouvrir l'assistant");
    expect(m.chat.bouton.querySelector("svg")).not.toBeNull();
    expect(m.chat.panneau.hidden).toBe(true);
    expect(document.body.classList.contains("avec-robot")).toBe(true);
  });

  it.each([
    ["désactivée", { ...PRETE, ia: { actif: false } }],
    ["mode local", { ...PRETE, modeCompte: false }],
  ])("IA %s : pas de bouton, Ctrl+I ne fait rien", async (_, contexte) => {
    const m = await monter(contexte);
    expect(m.chat.bouton.hidden).toBe(true);
    m.clavier({ key: "i", ctrlKey: true });
    expect(m.chat.panneau.hidden).toBe(true);
  });

  it("clic : panneau ouvert, focus dans la saisie ; Échap ferme et rend le focus au bouton", async () => {
    const m = await monter();
    m.chat.bouton.click();
    expect(m.chat.panneau.hidden).toBe(false);
    expect(document.activeElement).toBe(m.q(".chat-zone"));
    expect(m.chat.bouton.hidden).toBe(true);
    expect(document.documentElement.classList.contains("chat-ouvert")).toBe(true);
    expect(m.chat.panneau.getAttribute("aria-modal")).toBe("false");
    m.clavier({ key: "Escape" }, m.q(".chat-zone"));
    expect(m.chat.panneau.hidden).toBe(true);
    expect(m.chat.bouton.hidden).toBe(false);
    expect(document.activeElement).toBe(m.chat.bouton);
    expect(document.documentElement.classList.contains("chat-ouvert")).toBe(false);
  });

  it("Ctrl+I et Cmd+I ouvrent puis ferment", async () => {
    const m = await monter();
    m.clavier({ key: "i", ctrlKey: true });
    expect(m.chat.panneau.hidden).toBe(false);
    m.clavier({ key: "i", metaKey: true });
    expect(m.chat.panneau.hidden).toBe(true);
  });

  it("le journal des messages est annoncé (role log, aria-live)", async () => {
    const m = await monter();
    const liste = m.q(".chat-liste");
    expect(liste.getAttribute("role")).toBe("log");
    expect(liste.getAttribute("aria-live")).toBe("polite");
  });
});

describe("chat : conversation", () => {
  it("envoi : message, réponse en Markdown sûr, modèle affiché", async () => {
    const m = await monter();
    m.chat.ouvrir();
    m.ecrire("Bonjour");
    m.envoyer();
    await vi.waitFor(() => expect(m.qa(".chat-bulle--assistant strong")).toHaveLength(1));
    expect(m.q(".chat-bulle--utilisateur").textContent).toBe("Bonjour");
    expect(m.q(".chat-bulle--assistant strong").textContent).toBe("gras");
    expect(m.q(".chat-modele").textContent).toBe("gemini-x");
    expect(m.appels[0]).toEqual([{ role: "user", texte: "Bonjour" }]);
    expect(m.q(".chat-zone").value).toBe("");
  });

  it("copier une réponse : texte brut dans le presse-papiers", async () => {
    const copier = vi.fn(async () => {});
    const notifier = vi.fn();
    const m = await monter(PRETE, { copier, notifier });
    m.chat.ouvrir();
    m.ecrire("Bonjour");
    m.envoyer();
    await vi.waitFor(() => expect(m.q(".chat-copier")).not.toBeNull());
    m.q(".chat-copier").click();
    expect(copier).toHaveBeenCalledWith("Réponse 1 avec **gras**");
    await vi.waitFor(() => expect(notifier).toHaveBeenCalledWith("Réponse copiée"));
  });

  it("l'historique est renvoyé à chaque message", async () => {
    const m = await monter();
    m.chat.ouvrir();
    m.ecrire("un");
    m.envoyer();
    // The bubble appears with the first text: wait for the end of the answer.
    await vi.waitFor(() => expect(m.q(".chat-envoyer").textContent).toBe("Envoyer"));
    m.ecrire("deux");
    m.envoyer();
    await vi.waitFor(() => expect(m.appels).toHaveLength(2));
    expect(m.appels[1].map((x) => x.role)).toEqual(["user", "assistant", "user"]);
  });

  it("Entrée envoie, Maj+Entrée ne fait pas envoyer", async () => {
    const m = await monter();
    m.chat.ouvrir();
    m.ecrire("salut");
    m.clavier({ key: "Enter", shiftKey: true }, m.q(".chat-zone"));
    expect(m.appels).toHaveLength(0);
    m.clavier({ key: "Enter" }, m.q(".chat-zone"));
    await vi.waitFor(() => expect(m.appels).toHaveLength(1));
  });

  it("erreur : « Non envoyé — … », Réessayer renvoie le même message", async () => {
    let essai = 0;
    const m = await monter(PRETE, {
      appeler: async () => {
        if (essai++ === 0) throw { code: "functions/unavailable" };
        return { texte: "enfin", modele: "m" };
      },
    });
    m.chat.ouvrir();
    m.ecrire("coucou");
    m.envoyer();
    await vi.waitFor(() => expect(m.q(".chat-echec")).not.toBeNull());
    expect(m.q(".chat-echec").textContent).toContain("Non envoyé — Service indisponible");
    m.q(".chat-reessayer").click();
    await vi.waitFor(() => expect(m.q(".chat-bulle--assistant").textContent).toContain("enfin"));
    expect(m.q(".chat-echec")).toBeNull();
  });

  it("chargement visible ; Arrêter ignore la réponse tardive et permet de réessayer", async () => {
    let finir;
    const m = await monter(PRETE, { appeler: () => new Promise((r) => (finir = r)) });
    m.chat.ouvrir();
    m.ecrire("lent");
    m.envoyer();
    expect(m.q(".chat-attente")).not.toBeNull();
    expect(m.q(".chat-envoyer").textContent).toBe("Arrêter");
    m.envoyer(); // the same button: it stops the wait
    finir({ texte: "trop tard", modele: "m" });
    await Promise.resolve();
    await Promise.resolve();
    expect(m.q(".chat-attente")).toBeNull();
    expect(m.chat.panneau.textContent).not.toContain("trop tard");
    expect(m.q(".chat-echec").textContent).toContain("arrêté");
    expect(m.q(".chat-envoyer").textContent).toBe("Envoyer");
  });

  it("nouvelle conversation : confirmation au-delà de 4 messages, puis vide", async () => {
    const confirmer = vi.fn(async () => false);
    const m = await monter(PRETE, { confirmer });
    m.chat.ouvrir();
    for (const t of ["a", "b", "c"]) {
      m.ecrire(t);
      m.envoyer();
      await vi.waitFor(() => expect(m.q(".chat-attente")).toBeNull());
    }
    expect(m.qa(".chat-bulle")).toHaveLength(6);
    const bouton = m.qa(".chat-entete-bouton")[0];
    bouton.click();
    await vi.waitFor(() => expect(confirmer).toHaveBeenCalledTimes(1));
    expect(m.qa(".chat-bulle")).toHaveLength(6); // refused: nothing is erased
    confirmer.mockResolvedValue(true);
    bouton.click();
    await vi.waitFor(() => expect(m.qa(".chat-bulle")).toHaveLength(0));
    expect(m.q(".chat-vide")).not.toBeNull();
  });
  // The neutralisation of dangerous HTML is tested with a faithful DOM (jsdom) in chatMarkdown.test.js.
});

describe("chat : pas prêt", () => {
  it("sans clé : le panneau guide vers les réglages et la saisie est désactivée", async () => {
    const ouvrirReglagesIa = vi.fn();
    const m = await monter({ ...PRETE, cles: [] }, { ouvrirReglagesIa });
    m.chat.ouvrir();
    await vi.waitFor(() => expect(m.q(".chat-avis").hidden).toBe(false));
    expect(m.q(".chat-avis").textContent).toContain("Configurez l'assistant IA");
    expect(m.q(".chat-zone").disabled).toBe(true);
    m.q(".chat-avis button").click();
    expect(ouvrirReglagesIa).toHaveBeenCalled();
    expect(m.chat.panneau.hidden).toBe(true);
  });

  it("hors ligne : bouton visible, « Connexion Internet nécessaire », envoi désactivé", async () => {
    const m = await monter({ ...PRETE, enLigne: false });
    expect(m.chat.bouton.hidden).toBe(false);
    m.chat.ouvrir();
    await vi.waitFor(() => expect(m.q(".chat-avis").hidden).toBe(false));
    expect(m.q(".chat-avis").textContent).toContain("Connexion Internet nécessaire");
    expect(m.q(".chat-envoyer").disabled).toBe(true);
    expect(m.q(".chat-zone").disabled).toBe(true);
  });
});
