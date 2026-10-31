/* eslint-disable require-yield -- generators that fail before their first chunk */
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { diffuser } from "../../functions/src/ia/chatFlux.js";
import { CONFIG_PAR_DEFAUT } from "../../functions/src/ia/config.js";
import { creerFonctionsIa } from "../../functions/src/ia/fonctions.js";
import { analyserSse } from "../../functions/src/ia/fournisseurs/commun.js";
import * as gemini from "../../functions/src/ia/fournisseurs/gemini.js";
import { consommer } from "../../functions/src/quota.js";
import { baseMemoire } from "./baseMemoire.js";

const CLE = "sk-test-VraieCleSecrete-1234WXYZ";
const secret = randomBytes(32).toString("base64");
const encoder = new TextEncoder();

/** A body made of the given packets, as the network may cut them. */
async function* paquets(...morceaux) {
  for (const m of morceaux) yield typeof m === "string" ? encoder.encode(m) : m;
}
const tous = async (it) => {
  const sortie = [];
  for await (const x of it) sortie.push(x);
  return sortie;
};
const evt = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const candidat = (texte, extra = {}) => ({
  candidates: [{ content: { parts: [{ text: texte }] } }],
  ...extra,
});

describe("analyserSse", () => {
  it("événements complets, commentaires et [DONE]", async () => {
    const r = await tous(
      analyserSse(paquets(": ping\n\ndata: a\n\ndata: b\n\ndata: [DONE]\n\ndata: c\n\n")),
    );
    expect(r).toEqual(["a", "b"]);
  });

  it("lignes coupées entre deux paquets, \\r\\n compris", async () => {
    const flux = "data: bon\r\n\r\ndata: jour\r\n\r\n";
    const r = await tous(analyserSse(paquets(...[...flux].map((c) => c))));
    expect(r).toEqual(["bon", "jour"]);
  });

  it("caractère UTF-8 coupé en deux octets entre deux paquets", async () => {
    const octets = encoder.encode("data: é\n\n");
    const r = await tous(analyserSse(paquets(octets.slice(0, 7), octets.slice(7))));
    expect(r).toEqual(["é"]);
  });

  it("dernier événement sans ligne vide finale", async () => {
    expect(await tous(analyserSse(paquets("data: fin")))).toEqual(["fin"]);
  });
});

describe("gemini.envoyerFlux (V4.12)", () => {
  const demande = {
    cle: "AIzaSyExempleDeCleGeminiTresLongue1234",
    modele: "models/m",
    messages: [{ role: "user", texte: "Salut" }],
  };
  const fetchDe = (corps, statut = 200) =>
    vi.fn(async () => ({ ok: statut < 300, status: statut, body: corps, json: async () => ({}) }));

  it("reconstitue le texte, lit les jetons et la fin ; requête SSE conforme", async () => {
    const f = fetchDe(
      paquets(
        evt(candidat("Bon")),
        evt(candidat("jour", { usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } })),
        evt({
          candidates: [{ finishReason: "STOP" }],
          modelVersion: "m-1",
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3 },
        }),
      ),
    );
    const r = await tous(gemini.envoyerFlux(demande, { fetch: f }));
    expect(
      r
        .filter((e) => e.type === "texte")
        .map((e) => e.delta)
        .join(""),
    ).toBe("Bonjour");
    expect(r.at(-1)).toEqual({
      type: "fin",
      jetonsEntree: 4,
      jetonsSortie: 3,
      raisonArret: "STOP",
      modele: "m-1",
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toContain(":streamGenerateContent?alt=sse");
    expect(url).not.toContain(demande.cle);
    expect(init.headers["x-goog-api-key"]).toBe(demande.cle);
  });

  it("erreur au milieu du flux : texte reçu puis { type: erreur }", async () => {
    const f = fetchDe(paquets(evt(candidat("Début")), evt({ error: { code: 503, message: "x" } })));
    const r = await tous(gemini.envoyerFlux(demande, { fetch: f }));
    expect(r).toEqual([
      { type: "texte", delta: "Début" },
      { type: "erreur", code: "fournisseur-indisponible" },
    ]);
  });

  it("coupure réseau au milieu : erreur, texte déjà reçu conservé", async () => {
    async function* coupe() {
      yield encoder.encode(evt(candidat("Début")));
      throw new Error("reset");
    }
    const r = await tous(gemini.envoyerFlux(demande, { fetch: fetchDe(coupe()) }));
    expect(r.at(0)).toEqual({ type: "texte", delta: "Début" });
    expect(r.at(-1)).toEqual({ type: "erreur", code: "fournisseur-indisponible" });
  });

  it("refus avant le premier octet : exception avec le code commun", async () => {
    await expect(
      tous(gemini.envoyerFlux(demande, { fetch: fetchDe(paquets(), 403) })),
    ).rejects.toMatchObject({ code: "cle-invalide" });
  });

  it("annulation : le signal est transmis à la requête, qui est fermée ; le flux se termine sans erreur", async () => {
    const controleur = new AbortController();
    let signalRecu;
    const f = vi.fn(async (_url, init) => {
      signalRecu = init.signal;
      async function* corps() {
        yield encoder.encode(evt(candidat("a")));
        await new Promise((_, rejet) => {
          const annule = () => rejet(new DOMException("annulé", "AbortError"));
          if (init.signal.aborted) annule();
          else init.signal.addEventListener("abort", annule);
        });
      }
      return { ok: true, status: 200, body: corps() };
    });
    const sortie = [];
    for await (const e of gemini.envoyerFlux(
      { ...demande, signal: controleur.signal },
      { fetch: f },
    )) {
      sortie.push(e);
      controleur.abort();
    }
    expect(signalRecu.aborted).toBe(true);
    expect(sortie).toEqual([{ type: "texte", delta: "a" }]);
  });

  it("annulation avant la réponse : rien n'est renvoyé", async () => {
    const controleur = new AbortController();
    const f = vi.fn(
      async (_url, init) =>
        new Promise((_, rejet) =>
          init.signal.addEventListener("abort", () => rejet(new Error("annulé"))),
        ),
    );
    const attente = tous(
      gemini.envoyerFlux({ ...demande, signal: controleur.signal }, { fetch: f }),
    );
    controleur.abort();
    expect(await attente).toEqual([]);
  });

  it("réponse sans texte (requête bloquée) : erreur requete-invalide", async () => {
    const f = fetchDe(paquets(evt({ promptFeedback: { blockReason: "SAFETY" } })));
    expect(await tous(gemini.envoyerFlux(demande, { fetch: f }))).toEqual([
      { type: "erreur", code: "requete-invalide" },
    ]);
  });
});

describe("diffuser (regroupement des deltas)", () => {
  it("regroupe les petits deltas : un envoi par intervalle, l'ordre est gardé", async () => {
    const envoyes = [];
    async function* flux() {
      for (const d of ["a", "b", "c"]) yield { type: "texte", delta: d };
      await new Promise((r) => setTimeout(r, 40));
      for (const d of ["d", "e"]) yield { type: "texte", delta: d };
      yield { type: "fin", jetonsEntree: 1, jetonsSortie: 2 };
    }
    const fin = await diffuser(flux(), async (m) => void envoyes.push(m), { intervalle: 15 });
    expect(envoyes.map((m) => m.delta ?? m.type).join("|")).toBe("abc|de");
    expect(fin).toMatchObject({ type: "fin", jetonsSortie: 2 });
  });

  it("une erreur part après le texte qui la précède", async () => {
    const envoyes = [];
    async function* flux() {
      yield { type: "texte", delta: "x" };
      yield { type: "erreur", code: "limite-fournisseur" };
    }
    const fin = await diffuser(flux(), async (m) => void envoyes.push(m), { intervalle: 1000 });
    expect(envoyes).toEqual([
      { type: "texte", delta: "x" },
      { type: "erreur", code: "limite-fournisseur" },
    ]);
    expect(fin.type).toBe("erreur");
  });

  it("le client parti (envoi qui échoue) ne fait pas échouer la diffusion", async () => {
    async function* flux() {
      yield { type: "texte", delta: "x" };
      yield { type: "fin" };
    }
    const fin = await diffuser(
      flux(),
      async () => {
        throw new Error("socket");
      },
      { intervalle: 1 },
    );
    expect(fin.type).toBe("fin");
  });
});

describe("chatFlux (fonction serveur)", () => {
  const conversation = [{ role: "user", texte: "Explique le DNS" }];

  async function monter(evenements, { actif = true } = {}) {
    const db = baseMemoire();
    const envoyerFlux = vi.fn(async function* (p) {
      for (const e of evenements) yield e;
      void p;
    });
    const journal = vi.fn();
    const ia = creerFonctionsIa({
      db,
      secret: () => secret,
      fournisseurs: {
        gemini: {
          formatCle: /^sk-/,
          verifierCle: async () => ({ valide: true }),
          envoyer: vi.fn(),
          envoyerFlux,
        },
      },
      config: async () => CONFIG_PAR_DEFAUT,
      consommer: (u, o) => consommer(db, u, o),
      journal,
      horloge: () => Date.UTC(2026, 9, 29),
    });
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await db.doc("users/u1").set({ reglages: { ia: { actif } } });
    return { ia, db, envoyerFlux, journal };
  }

  it("envoie les morceaux, renvoie les jetons, prompt et température du chat", async () => {
    const { ia, envoyerFlux, journal } = await monter([
      { type: "texte", delta: "Le DNS" },
      { type: "fin", jetonsEntree: 5, jetonsSortie: 7, raisonArret: "STOP", modele: "m" },
    ]);
    const morceaux = [];
    const r = await ia.chatFlux(
      "u1",
      { messages: conversation },
      { envoyerMorceau: async (m) => void morceaux.push(m) },
    );
    expect(morceaux).toEqual([{ type: "texte", delta: "Le DNS" }]);
    expect(r).toEqual({
      ok: true,
      modele: "m",
      jetonsEntree: 5,
      jetonsSortie: 7,
      raisonArret: "STOP",
    });
    const appel = envoyerFlux.mock.calls[0][0];
    expect(appel).toMatchObject({ temperature: 0.5, maxJetons: 1000 });
    expect(appel.systeme).toBeTruthy();
    expect(journal).toHaveBeenCalledWith(
      expect.objectContaining({ action: "chatFlux", jetons: 12 }),
    );
    expect(JSON.stringify(journal.mock.calls)).not.toContain(CLE);
  });

  it("consomme 1 appel de quota au début, même si l'utilisateur arrête", async () => {
    const { ia, db } = await monter([{ type: "texte", delta: "x" }]);
    const controleur = new AbortController();
    controleur.abort();
    await ia.chatFlux("u1", { messages: conversation }, { signal: controleur.signal });
    expect(db.lire("users/u1/prive/quota").appels).toBe(1);
  });

  it("le signal est transmis à l'adaptateur (annulation chez le fournisseur)", async () => {
    const { ia, envoyerFlux } = await monter([]);
    const controleur = new AbortController();
    await ia.chatFlux("u1", { messages: conversation }, { signal: controleur.signal });
    expect(envoyerFlux.mock.calls[0][0].signal).toBe(controleur.signal);
  });

  it("erreur au milieu : morceau d'erreur envoyé, résultat ok:false", async () => {
    const { ia } = await monter([
      { type: "texte", delta: "a" },
      { type: "erreur", code: "fournisseur-indisponible" },
    ]);
    const morceaux = [];
    const r = await ia.chatFlux(
      "u1",
      { messages: conversation },
      { envoyerMorceau: async (m) => void morceaux.push(m) },
    );
    expect(r).toEqual({ ok: false });
    expect(morceaux.at(-1)).toEqual({ type: "erreur", code: "fournisseur-indisponible" });
  });

  it("mêmes refus que iaChat : IA désactivée, dernier message pas de l'utilisateur, champ en trop", async () => {
    const off = await monter([], { actif: false });
    await expect(off.ia.chatFlux("u1", { messages: conversation })).rejects.toMatchObject({
      code: "ia-desactivee",
    });
    const { ia, envoyerFlux } = await monter([]);
    await expect(
      ia.chatFlux("u1", { messages: [{ role: "assistant", texte: "a" }] }),
    ).rejects.toThrow();
    await expect(
      ia.chatFlux("u1", { messages: conversation, fournisseur: "autre" }),
    ).rejects.toThrow();
    expect(envoyerFlux).not.toHaveBeenCalled();
  });

  it("erreur avant le premier octet : propagée (appel normal en erreur)", async () => {
    const { ia, envoyerFlux } = await monter([]);
    const { ErreurFournisseur } = await import("../../functions/src/ia/fournisseurs/commun.js");
    envoyerFlux.mockImplementation(async function* () {
      throw new ErreurFournisseur("cle-invalide");
    });
    await expect(ia.chatFlux("u1", { messages: conversation })).rejects.toMatchObject({
      code: "cle-invalide",
    });
  });
});
