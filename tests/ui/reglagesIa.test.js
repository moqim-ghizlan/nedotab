import { afterEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { iaDe } from "../../src/core/ia.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerSectionChatbot, sectionIa } from "../../src/ui/reglages/ia.js";

afterEach(() => document.body.replaceChildren());

const attendre = () => new Promise((r) => setTimeout(r, 0));

function monter({ mode = "compte", cles = [] } = {}) {
  const store = creerStore(etatInitial(), reduire);
  const session = { synchro: { lire: () => ({ mode }), abonner: () => () => {} } };
  const service = {
    // An old config/ia may still list OpenAI: it must not show.
    config: async () => ({
      fournisseurs: [
        { id: "openai", nom: "OpenAI (GPT)", lienCle: "https://x.test/", actif: true },
        { id: "gemini", nom: "Google (Gemini)", lienCle: "https://y.test/", actif: true },
      ],
    }),
    etatCles: vi.fn(async () => ({ ok: true, valeur: cles })),
    enregistrerCle: vi.fn(),
    supprimerCle: vi.fn(),
    tester: vi.fn(async () => ({ ok: true, valeur: { ok: true, latenceMs: 820, modele: "m" } })),
  };
  const { section } = sectionIa({ store, session, service });
  // T10: the main switch is in the Features tab, with the three places of the chatbot.
  const { section: chatbot, maj } = creerSectionChatbot({ store });
  store.abonner(maj); // the settings panel does the same
  document.body.append(section, chatbot);
  return { store, section, chatbot, service };
}

describe("Réglages → Assistant IA", () => {
  it("mode local : une explication, rien d'autre, aucun appel au serveur", async () => {
    const { section, service } = monter({ mode: "local" });
    await attendre();
    expect(section.textContent).toContain("Connectez-vous pour utiliser l'assistant.");
    expect(section.querySelector("input, select, button")).toBeNull();
    expect(service.etatCles).not.toHaveBeenCalled();
  });

  it("aucun « null » écrit à l'écran quand des blocs sont vides", async () => {
    const { section } = monter();
    await attendre();
    await attendre();
    expect(section.textContent).not.toContain("null");
  });

  it("désactivé par défaut ; l'interrupteur active et synchronise le réglage", async () => {
    const { store, section, chatbot } = monter();
    await attendre();
    await attendre();
    const interrupteur = chatbot.querySelector("input[type=checkbox]");
    expect(interrupteur.checked).toBe(false);
    // Tout est grisé tant que l'assistant est désactivé.
    for (const b of section.querySelectorAll(".ia-cle button.bouton"))
      expect(b.disabled).toBe(true);
    interrupteur.checked = true;
    interrupteur.dispatchEvent(new Event("change"));
    expect(iaDe(store.lire().reglages).actif).toBe(true);
    expect(section.querySelector(".ia-cle button.bouton").disabled).toBe(false);
  });

  it("section Chatbot (T10) : interrupteur principal, trois emplacements grisés puis actifs", async () => {
    const { store, chatbot } = monter();
    const sous = () => [...chatbot.querySelectorAll(".ia-sous-options input")];
    expect(sous().length).toBeGreaterThanOrEqual(2);
    expect(sous().every((i) => i.disabled)).toBe(true);
    const principal = chatbot.querySelector("input[type=checkbox]");
    principal.checked = true;
    principal.dispatchEvent(new Event("change"));
    expect(sous().every((i) => !i.disabled && i.checked)).toBe(true);
    const recherche = chatbot.querySelector('[data-chatbot="rechercheIa"]');
    recherche.checked = false;
    recherche.dispatchEvent(new Event("change"));
    expect(iaDe(store.lire().reglages)).toMatchObject({ actif: true, sansRechercheIa: true });
  });

  it("Gemini seul : sans clé, puis avec clé (fin affichée, jamais la clé)", async () => {
    const sans = monter();
    await attendre();
    await attendre();
    const ligne = sans.section.querySelector(".ia-cle");
    expect(ligne.textContent).toContain("Pas de clé");
    expect(ligne.textContent).toContain("Ajouter ma clé");
    expect(sans.section.textContent).not.toContain("OpenAI");
    document.body.replaceChildren();
    const { section } = monter({
      cles: [
        { fournisseur: "gemini", fin: "ppzA", ajouteLe: Date.UTC(2026, 9, 21, 12), valide: true },
      ],
    });
    await attendre();
    await attendre();
    const lignes = [...section.querySelectorAll(".ia-cle")];
    expect(lignes.map((l) => l.querySelector("strong").textContent)).toEqual(["Google (Gemini)"]);
    expect(lignes[0].textContent).toContain("…ppzA");
    expect(lignes[0].textContent).toContain("Remplacer");
    expect(lignes[0].textContent).toContain("Supprimer");
  });

  it("clé invalide : badge « À vérifier »", async () => {
    const { section } = monter({
      cles: [{ fournisseur: "gemini", fin: "abcd", ajouteLe: 1, valide: false }],
    });
    await attendre();
    await attendre();
    expect(section.querySelector(".ia-cle-etat--alerte").textContent).toContain("À vérifier");
  });

  it("aucun choix de modèle, aucune vérification de modèles, aucun appel automatique", async () => {
    const { section, chatbot, service } = monter({
      cles: [{ fournisseur: "gemini", fin: "ppzA", ajouteLe: 1, valide: true }],
    });
    await attendre();
    await attendre();
    await attendre();
    const check = chatbot.querySelector("input[type=checkbox]");
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    expect(section.querySelector("select:not(#ia-question-barre):not(#ia-sites-chat)")).toBeNull();
    expect(section.textContent).not.toMatch(/modèle/i);
    expect(service.tester).not.toHaveBeenCalled();
    expect(service.modeles).toBeUndefined();
    expect(service.verifierModeles).toBeUndefined();
  });

  it("« Tester ma clé » affiche « OK · 820 ms »", async () => {
    const { store, section, service } = monter({
      cles: [{ fournisseur: "gemini", fin: "ppzA", ajouteLe: 1, valide: true }],
    });
    await attendre();
    await attendre();
    store.envoyer({ type: "REGLAGES_MODIFIER", changements: { ia: { actif: true } } });
    const ligne = section.querySelector(".ia-usage");
    ligne.querySelector("button").click();
    await attendre();
    await attendre();
    expect(service.tester).toHaveBeenCalledWith("gemini");
    expect(ligne.querySelector(".ia-test").textContent).toBe("OK · 820 ms");
  });

  it("guide en deux étapes quand l'assistant est activé sans aucune clé", async () => {
    const { section, chatbot } = monter();
    await attendre();
    await attendre();
    expect(section.querySelector(".ia-guide")).toBeNull();
    const check = chatbot.querySelector("input[type=checkbox]");
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    expect(section.querySelectorAll(".ia-guide li")).toHaveLength(2);
  });
});
