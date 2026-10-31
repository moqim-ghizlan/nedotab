/* eslint-disable require-yield -- generators that fail before their first chunk */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fluxAvecRepli, peutRepli } from "../../src/firebase/iaFlux.js";
import { creerChat, INTERVALLE_RENDU_MS } from "../../src/ui/chat/panneau.js";

const PRETE = {
  ia: { actif: true },
  modeCompte: true,
  enLigne: true,
  cles: [{ fournisseur: "gemini", valide: true }],
};

/** A stream driven by the test: `pousser` adds an event, `finir` closes it. */
function fluxManuel() {
  const file = [];
  let reveil = null;
  let termine = false;
  const etat = { signal: null, appels: 0 };
  const reveiller = () => {
    reveil?.();
    reveil = null;
  };
  return {
    etat,
    pousser: (e) => {
      file.push(e);
      reveiller();
    },
    finir: () => {
      termine = true;
      reveiller();
    },
    flux: async function* (_messages, options) {
      etat.appels++;
      etat.signal = options.signal;
      options.signal.addEventListener("abort", reveiller);
      while (true) {
        if (options.signal.aborted) throw new DOMException("annulé", "AbortError");
        if (file.length) {
          yield file.shift();
          continue;
        }
        if (termine) return;
        await new Promise((r) => (reveil = r));
      }
    },
  };
}

const vider = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function monter(flux) {
  document.body.replaceChildren();
  document.documentElement.classList.remove("chat-ouvert");
  const chat = creerChat({
    contexteIa: async () => PRETE,
    appeler: async () => ({ texte: "complet" }),
    flux,
    notifier: vi.fn(),
    copier: vi.fn(async () => {}),
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
  };
  return { chat, q, poser, qa: (s) => [...chat.panneau.querySelectorAll(s)] };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("chat en streaming (V4.12)", () => {
  it("le texte s'affiche au fil de l'eau, curseur et aria-busy pendant la génération", async () => {
    const s = fluxManuel();
    const m = await monter(s.flux);
    await m.poser("Explique");
    s.pousser({ type: "texte", delta: "Le **DNS**" });
    await vider();
    const bulle = m.q(".chat-bulle--assistant");
    expect(bulle.classList.contains("chat-bulle--flux")).toBe(true);
    expect(bulle.getAttribute("aria-busy")).toBe("true");
    expect(m.q(".chat-liste").getAttribute("aria-live")).toBe("off");
    expect(bulle.querySelector("strong").textContent).toBe("DNS");
    // The button is "Arrêter" while it streams.
    expect(m.q(".chat-envoyer").textContent).toBe("Arrêter");

    s.pousser({ type: "texte", delta: " traduit" });
    await vider();
    vi.advanceTimersByTime(INTERVALLE_RENDU_MS);
    expect(bulle.textContent).toContain("traduit");

    s.pousser({ type: "fin", modele: "m" });
    s.finir();
    await vider();
    expect(bulle.classList.contains("chat-bulle--flux")).toBe(false);
    expect(bulle.getAttribute("aria-busy")).toBe("false");
    expect(m.q(".chat-liste").getAttribute("aria-live")).toBe("polite");
    vi.advanceTimersByTime(100);
    expect(m.q(".chat-annonce").textContent).toBe("Réponse de l'assistant reçue");
  });

  it("100 deltas en 200 ms : au plus 5 rendus", async () => {
    const s = fluxManuel();
    const m = await monter(s.flux);
    await m.poser("go");
    s.pousser({ type: "texte", delta: "début " });
    await vider();
    const contenu = m.q(".chat-contenu");
    const rendus = vi.fn();
    new MutationObserver(rendus).observe(contenu, { childList: true });
    let compte = 0;
    contenu.replaceChildren = ((original) =>
      function (...a) {
        compte++;
        return original.apply(this, a);
      })(contenu.replaceChildren);
    for (let i = 0; i < 100; i++) {
      s.pousser({ type: "texte", delta: "x" });
      await vider();
      vi.advanceTimersByTime(2);
    }
    expect(compte).toBeLessThanOrEqual(5);
    expect(compte).toBeGreaterThan(0);
    s.finir();
    await vider();
    expect(m.q(".chat-contenu").textContent.trim()).toBe(`début ${"x".repeat(100)}`);
  });

  it("Arrêter : le flux est fermé, le texte reçu reste avec « (interrompu) »", async () => {
    const s = fluxManuel();
    const m = await monter(s.flux);
    await m.poser("go");
    s.pousser({ type: "texte", delta: "Partiel" });
    await vider();
    m.q(".chat-envoyer").click();
    await vider();
    expect(s.etat.signal.aborted).toBe(true);
    expect(m.q(".chat-contenu").textContent.trim()).toBe("Partiel");
    expect(m.q(".chat-interrompu").textContent).toBe("(interrompu)");
    expect(m.q(".chat-envoyer").textContent).toBe("Envoyer");
    // The next message works.
    expect(m.qa(".chat-reessayer")).toHaveLength(0);
  });

  it("Arrêter avant tout texte : message rejouable, flux fermé", async () => {
    const s = fluxManuel();
    const m = await monter(s.flux);
    await m.poser("go");
    m.q(".chat-envoyer").click();
    await vider();
    expect(s.etat.signal.aborted).toBe(true);
    expect(m.q(".chat-echec").textContent).toContain("arrêté");
    expect(m.qa(".chat-reessayer")).toHaveLength(1);
  });

  it("erreur au milieu du flux : texte gardé, « Réponse interrompue — Réessayer » relance la question", async () => {
    let n = 0;
    const flux = async function* () {
      n++;
      if (n === 1) {
        yield { type: "texte", delta: "Début" };
        yield { type: "erreur", code: "fournisseur-indisponible" };
      } else {
        yield { type: "texte", delta: "Réponse complète" };
        yield { type: "fin" };
      }
    };
    const m = await monter(flux);
    await m.poser("go");
    vi.advanceTimersByTime(100);
    expect(m.q(".chat-contenu").textContent.trim()).toBe("Début");
    expect(m.q(".chat-interrompu").textContent).toContain("Réponse interrompue");
    m.q(".chat-interrompu .chat-reessayer").click();
    await vider();
    vi.advanceTimersByTime(100);
    const reponses = m.qa(".chat-bulle--assistant .chat-contenu");
    expect(reponses.map((r) => r.textContent.trim())).toEqual(["Réponse complète"]);
  });

  it("coupure réseau (exception) après du texte : même comportement", async () => {
    const flux = async function* () {
      yield { type: "texte", delta: "Début" };
      throw new Error("reset");
    };
    const m = await monter(flux);
    await m.poser("go");
    expect(m.q(".chat-contenu").textContent.trim()).toBe("Début");
    expect(m.qa(".chat-reessayer")).toHaveLength(1);
  });

  it("erreur avant tout texte : message d'erreur sur la question, Réessayer", async () => {
    const flux = async function* () {
      throw Object.assign(new Error("x"), {
        code: "functions/permission-denied",
        details: { code: "cle-invalide" },
      });
    };
    const m = await monter(flux);
    await m.poser("go");
    expect(m.q(".chat-echec").textContent).toContain("Non envoyé");
    expect(m.qa(".chat-bulle--assistant")).toHaveLength(0);
  });

  it("HTML dans la réponse en cours de flux : jamais interprété", async () => {
    const s = fluxManuel();
    const m = await monter(s.flux);
    await m.poser("go");
    s.pousser({ type: "texte", delta: "<img src=x onerror=alert(1)> <script>x</script> ok" });
    s.finir();
    await vider();
    expect(m.qa(".chat-contenu img, .chat-contenu script")).toHaveLength(0);
  });
});

describe("fluxAvecRepli (V4.12)", () => {
  const tous = async (it) => {
    const r = [];
    for await (const x of it) r.push(x);
    return r;
  };
  const reseau = () => Object.assign(new Error("fetch"), { code: "functions/unavailable" });

  it("le flux s'ouvre : aucun repli", async () => {
    const complet = vi.fn();
    const ouvrir = async function* () {
      yield { type: "texte", delta: "a" };
      yield { type: "fin" };
    };
    expect(await tous(fluxAvecRepli({ ouvrir, complet }, [], {}))).toHaveLength(2);
    expect(complet).not.toHaveBeenCalled();
  });

  it("ouverture impossible : une réponse complète non-streaming", async () => {
    const ouvrir = async function* () {
      throw reseau();
    };
    const complet = vi.fn(async () => ({ texte: "complet", modele: "m" }));
    const r = await tous(fluxAvecRepli({ ouvrir, complet }, [{ role: "user", texte: "q" }], {}));
    expect(r).toEqual([
      { type: "texte", delta: "complet" },
      { type: "fin", modele: "m" },
    ]);
    expect(complet).toHaveBeenCalledTimes(1);
  });

  it("refus connu (clé invalide, quota) : pas de repli, donc pas de second quota", async () => {
    const refus = Object.assign(new Error("x"), {
      code: "functions/resource-exhausted",
      details: { code: "quota-depasse" },
    });
    const ouvrir = async function* () {
      throw refus;
    };
    const complet = vi.fn();
    await expect(tous(fluxAvecRepli({ ouvrir, complet }, [], {}))).rejects.toBe(refus);
    expect(complet).not.toHaveBeenCalled();
  });

  it("erreur après des morceaux ou annulation : pas de repli", async () => {
    const complet = vi.fn();
    const ouvrir = async function* () {
      yield { type: "texte", delta: "a" };
      throw reseau();
    };
    await expect(tous(fluxAvecRepli({ ouvrir, complet }, [], {}))).rejects.toThrow();
    const controleur = new AbortController();
    controleur.abort();
    const ouvrir2 = async function* () {
      throw reseau();
    };
    await expect(
      tous(fluxAvecRepli({ ouvrir: ouvrir2, complet }, [], { signal: controleur.signal })),
    ).rejects.toThrow();
    expect(complet).not.toHaveBeenCalled();
  });

  it("peutRepli : réseau et erreurs internes oui, refus connus et annulation non", () => {
    expect(peutRepli(new TypeError("Failed to fetch"))).toBe(true);
    expect(peutRepli({ code: "functions/failed-precondition" })).toBe(true);
    expect(peutRepli({ code: "functions/unauthenticated" })).toBe(false);
    expect(peutRepli({ code: "functions/internal", details: { code: "cle-absente" } })).toBe(false);
    expect(peutRepli(new DOMException("a", "AbortError"))).toBe(false);
  });
});
