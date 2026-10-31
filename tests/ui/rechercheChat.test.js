import { describe, expect, it } from "vitest";
import { creerChat } from "../../src/ui/chat/panneau.js";
import { creerRecherche } from "../../src/ui/recherche.js";

const site = (id, titre, url, tags = [], description = "") => ({
  id,
  type: "site",
  titre,
  url,
  creeLe: 0,
  tags,
  description,
});

const GRILLE = [
  site("fac", "Facture Express", "https://facture.exemple.fr", ["factures"], "Créer des factures"),
  site("pix", "Pixlr", "https://pixlr.com", ["photo"], "Retoucher des photos"),
  site("gh", "GitHub", "https://github.com", ["code"], "Code et Git"),
  site("mal", "Piège", "javascript:alert(1)", ["factures"]),
];

const PRETE = {
  ia: { actif: true },
  modeCompte: true,
  enLigne: true,
  cles: [{ fournisseur: "gemini", valide: true }],
};

const vider = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** The bar and the chat side by side, as app.js links them; the AI is simulated. */
async function monter({
  reglages = {},
  reponse = { intention: "site", resultats: [] },
  echec = null,
} = {}) {
  document.body.replaceChildren();
  document.documentElement.classList.remove("chat-ouvert");
  const store = { lire: () => ({ grille: GRILLE, reglages }), abonner: () => {} };
  const appelsRecherche = [];
  const envoyesAuChat = [];
  const chat = creerChat({
    contexteIa: async () => PRETE,
    appeler: async () => ({ texte: "r" }),
    flux: async function* (messages) {
      envoyesAuChat.push(messages);
      yield { type: "texte", delta: "Voici la réponse" };
      yield { type: "fin" };
    },
  });
  const { racine, champ } = creerRecherche(store, {
    ouvrirDossier: () => {},
    contexteIa: async () => PRETE,
    demanderIa: async (q) => {
      appelsRecherche.push(q);
      if (echec) throw echec;
      return reponse;
    },
    poserAuChat: (q, o) => chat.poserQuestion(q, o),
  });
  document.body.append(racine, chat.bouton, chat.panneau);
  await vider();
  champ.dispatchEvent(new Event("focus"));
  await vider();
  const versQuestion = () => {
    // "?" typed first: question mode (the bar goes back to the search after a question).
    if (racine.classList.contains("recherche--demander")) return;
    champ.value = "";
    champ.dispatchEvent(new Event("input"));
    champ.value = "?";
    champ.dispatchEvent(new Event("input"));
  };
  const poser = async (texte) => {
    versQuestion();
    champ.value = texte;
    champ.dispatchEvent(new Event("input"));
    champ.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await vider();
  };
  const q = (s) => document.querySelector(s);
  return {
    chat,
    champ,
    poser,
    appelsRecherche,
    envoyesAuChat,
    q,
    qa: (s) => [...document.querySelectorAll(s)],
    lignes: () => [...racine.querySelectorAll("li.resultat")],
  };
}

describe("barre → chat (V4.13)", () => {
  it("question générale : chat ouvert, question envoyée, aucun appel à la recherche", async () => {
    const m = await monter();
    await m.poser("comment faire une pâte brisée");
    expect(m.appelsRecherche).toEqual([]);
    expect(m.chat.estOuvert()).toBe(true);
    expect(m.envoyesAuChat[0].at(-1)).toEqual({
      role: "user",
      texte: "comment faire une pâte brisée",
    });
    expect(m.q(".chat-origine").textContent).toBe("depuis la barre de recherche");
    expect(m.q(".chat-bulle--assistant").textContent).toContain("Voici la réponse");
    expect(m.champ.value).toBe(""); // the bar is emptied
  });

  it("recherche d'un site : résultats dans la barre, chat fermé, « Demander à l'assistant à la place »", async () => {
    const m = await monter({
      reponse: { intention: "site", resultats: [{ id: "fac", score: 0.9 }] },
    });
    await m.poser("mon outil de facture");
    expect(m.appelsRecherche).toEqual(["mon outil de facture"]);
    expect(m.chat.estOuvert()).toBe(false);
    expect(
      m
        .lignes()
        .map((l) => l.textContent)
        .join(" "),
    ).toContain("Facture Express");
    expect(document.body.textContent).toContain("Demander à l'assistant à la place");
  });

  it("« Demander à l'assistant à la place » envoie la question au chat", async () => {
    const m = await monter({
      reponse: { intention: "site", resultats: [{ id: "fac", score: 0.9 }] },
    });
    await m.poser("mon outil de facture");
    const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent.includes("à la place"),
    );
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option.click();
    await vider();
    expect(m.chat.estOuvert()).toBe(true);
    expect(m.envoyesAuChat[0].at(-1).texte).toBe("mon outil de facture");
  });

  it("doute, le modèle répond « question » : chat ouvert avec la question", async () => {
    const m = await monter({ reponse: { intention: "question", resultats: [] } });
    await m.poser("photo de montagne en noir et blanc");
    // "photo" is a known word: the model decided, after one call.
    expect(m.appelsRecherche).toHaveLength(1);
    expect(m.chat.estOuvert()).toBe(true);
    expect(m.envoyesAuChat).toHaveLength(1);
  });

  it("les deux : résultats dans la barre ET chat avec la carte des sites (3 au plus, http(s) seulement)", async () => {
    const m = await monter({
      reponse: {
        intention: "les_deux",
        resultats: [
          { id: "fac", score: 0.9 },
          { id: "mal", score: 0.8 },
          { id: "pix", score: 0.7 },
          { id: "gh", score: 0.6 },
        ],
      },
    });
    await m.poser("quel site pour mes factures et comment en faire une");
    expect(m.appelsRecherche).toHaveLength(1);
    expect(m.lignes().length).toBeGreaterThan(0);
    expect(m.chat.estOuvert()).toBe(true);
    expect(m.q(".chat-sites-titre").textContent).toBe("Sites correspondants");
    const liens = m.qa(".chat-sites a");
    expect(liens.map((a) => a.textContent)).toEqual(["Facture Express", "Pixlr"]); // javascript: dropped, 3 max
    expect(liens.every((a) => a.rel.includes("noopener"))).toBe(true);
    // The cards are not part of what is sent to the model.
    expect(JSON.stringify(m.envoyesAuChat[0])).not.toContain("Sites correspondants");
  });

  it("intention inconnue ou absente : comme une recherche de sites", async () => {
    const m = await monter({
      reponse: { intention: "pirate", resultats: [{ id: "gh", score: 1 }] },
    });
    await m.poser("un dépôt de code git");
    expect(m.chat.estOuvert()).toBe(false);
    expect(
      m
        .lignes()
        .map((l) => l.textContent)
        .join(" "),
    ).toContain("GitHub");
  });

  it("échec du routage : repli local, et la question peut aller au chat", async () => {
    const m = await monter({ echec: { code: "functions/unavailable" } });
    await m.poser("mon outil de facture");
    expect(m.chat.estOuvert()).toBe(false);
    expect(document.body.textContent).toContain("Demander à l'assistant à la place");
  });

  it("préférence « chat » : tout va au chat, sans appel de routage, même « mes sites »", async () => {
    const m = await monter({ reglages: { ia: { actif: true, questionBarre: "chat" } } });
    await m.poser("mes sites de code");
    expect(m.appelsRecherche).toEqual([]);
    expect(m.chat.estOuvert()).toBe(true);
  });

  it("préférence « sites » : jamais le chat, même pour « comment… »", async () => {
    const m = await monter({
      reglages: { ia: { actif: true, questionBarre: "sites" } },
      reponse: { intention: "question", resultats: [] },
    });
    await m.poser("comment faire une facture");
    expect(m.appelsRecherche).toHaveLength(1);
    expect(m.chat.estOuvert()).toBe(false);
  });
});

describe("chat.poserQuestion : une seule conversation", () => {
  it("la question est ajoutée à la conversation en cours, pas une nouvelle", async () => {
    const m = await monter();
    await m.poser("comment faire une pâte brisée");
    await m.poser("explique-moi le DNS");
    expect(m.envoyesAuChat).toHaveLength(2);
    expect(m.envoyesAuChat[1].map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m.qa(".chat-bulle--utilisateur")).toHaveLength(2);
  });

  it("pendant qu'une réponse s'écrit : la question est mise dans le champ, rien n'est perdu", async () => {
    document.body.replaceChildren();
    let finir;
    const chat = creerChat({
      contexteIa: async () => PRETE,
      appeler: async () => ({ texte: "r" }),
      flux: async function* () {
        yield { type: "texte", delta: "début" };
        await new Promise((r) => (finir = r));
        yield { type: "fin" };
      },
    });
    document.body.append(chat.bouton, chat.panneau);
    await vider();
    expect(chat.poserQuestion("première")).toBe(true);
    await vider();
    expect(chat.poserQuestion("seconde")).toBe(false);
    expect(chat.panneau.querySelector(".chat-zone").value).toBe("seconde");
    finir();
    await vider();
  });
});
