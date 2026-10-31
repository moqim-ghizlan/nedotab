// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { creerChat } from "../../src/ui/chat/panneau.js";

const PRETE = {
  ia: { actif: true },
  modeCompte: true,
  enLigne: true,
  cles: [{ fournisseur: "gemini", valide: true }],
};

const SITES = {
  "id-1": {
    id: "id-1",
    titre: "Marmiton",
    url: "https://www.marmiton.org",
    chemin: ["Cuisine"],
    site: { id: "id-1", type: "site", titre: "Marmiton", url: "https://www.marmiton.org" },
  },
};

const vider = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

async function monter(reponses) {
  document.body.replaceChildren();
  const envoyes = [];
  const flux = async function* (messages) {
    envoyes.push(messages);
    for (const e of reponses.shift()) yield e;
  };
  const afficherSite = vi.fn();
  const chat = creerChat({
    contexteIa: async () => PRETE,
    appeler: async () => ({ texte: "" }),
    flux,
    trouverSite: (id) => SITES[id] ?? null,
    afficherSite,
    notifier: vi.fn(),
  });
  document.body.append(chat.bouton, chat.panneau);
  await vider();
  chat.ouvrir();
  const q = (s) => chat.panneau.querySelector(s);
  const poser = async (texte) => {
    q(".chat-zone").value = texte;
    q(".chat-zone").dispatchEvent(new Event("input"));
    q(".chat-saisie").dispatchEvent(new Event("submit", { cancelable: true }));
    await vider();
    await new Promise((r) => setTimeout(r, 80));
  };
  return { chat, q, poser, envoyes, afficherSite };
}

describe("chat : sites cités (V4.14)", () => {
  it("la fin du flux traduit s1 en identifiant réel : carte cliquable, mention de consultation", async () => {
    const m = await monter([
      [
        { type: "texte", delta: "Essayez [[site:s1]] ou [[site:s2]]." },
        { type: "fin", modele: "m", sites: { s1: "id-1" }, consulte: true },
      ],
    ]);
    await m.poser("Quels sites pour cuisiner ?");
    const bulle = m.q(".chat-bulle--assistant");
    const cartes = bulle.querySelectorAll(".chat-site");
    expect(cartes).toHaveLength(2);
    expect(cartes[0].querySelector(".chat-site-titre").textContent).toBe("Marmiton");
    expect(cartes[0].querySelector("a").getAttribute("href")).toBe("https://www.marmiton.org");
    expect(cartes[1].textContent).toBe("(site introuvable)");
    expect(bulle.querySelector(".chat-consulte").textContent).toMatch(/consulté vos sites/);
    cartes[0].querySelector(".chat-site-grille").click();
    expect(m.afficherSite).toHaveBeenCalledWith("id-1");
  });

  it("sans consultation : pas de mention, les références inventées sont « introuvables »", async () => {
    const m = await monter([
      [{ type: "texte", delta: "Voir [[site:s1]]" }, { type: "fin", modele: "m" }],
    ]);
    await m.poser("Explique le DNS");
    const bulle = m.q(".chat-bulle--assistant");
    expect(bulle.querySelector(".chat-consulte")).toBeNull();
    expect(bulle.querySelector(".chat-site").textContent).toBe("(site introuvable)");
  });

  it("l'historique renvoyé ensuite contient le titre du site, pas son identifiant", async () => {
    const m = await monter([
      [
        { type: "texte", delta: "Voir [[site:s1]]" },
        { type: "fin", modele: "m", sites: { s1: "id-1" }, consulte: true },
      ],
      [{ type: "texte", delta: "ok" }, { type: "fin" }],
    ]);
    await m.poser("Mes sites de cuisine ?");
    await m.poser("Et ensuite ?");
    const historique = m.envoyes[1];
    expect(historique[1]).toEqual({ role: "assistant", texte: "Voir « Marmiton »" });
    expect(JSON.stringify(historique)).not.toMatch(/id-1|site:/);
  });
});
