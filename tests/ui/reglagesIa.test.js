import { afterEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { iaDe } from "../../src/core/ia.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { sectionIa } from "../../src/ui/reglages/ia.js";

afterEach(() => document.body.replaceChildren());

const attendre = () => new Promise((r) => setTimeout(r, 0));

function monter({ mode = "compte", cles = [], suggeres = [] } = {}) {
  const store = creerStore(etatInitial(), reduire);
  const session = { synchro: { lire: () => ({ mode }), abonner: () => () => {} } };
  const service = {
    config: async () => ({
      fournisseurs: [
        { id: "openai", nom: "OpenAI (GPT)", lienCle: "https://x.test/", actif: true },
        { id: "gemini", nom: "Google (Gemini)", lienCle: "https://y.test/", actif: true },
      ],
      modelesSuggeres: suggeres,
    }),
    etatCles: vi.fn(async () => ({ ok: true, valeur: cles })),
    enregistrerCle: vi.fn(),
    supprimerCle: vi.fn(),
    tester: vi.fn(async () => ({ ok: true, valeur: { ok: true, latenceMs: 820, modele: "m" } })),
  };
  const { section } = sectionIa({ store, session, service });
  document.body.append(section);
  return { store, section, service };
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
    const { store, section } = monter();
    await attendre();
    await attendre();
    const interrupteur = section.querySelector("input[type=checkbox]");
    expect(interrupteur.checked).toBe(false);
    // Tout est grisé tant que l'assistant est désactivé.
    for (const b of section.querySelectorAll(".ia-cle button.bouton"))
      expect(b.disabled).toBe(true);
    interrupteur.checked = true;
    interrupteur.dispatchEvent(new Event("change"));
    expect(iaDe(store.lire().reglages).actif).toBe(true);
    expect(section.querySelector(".ia-cle button.bouton").disabled).toBe(false);
  });

  it("une ligne par fournisseur : sans clé, puis avec clé (fin affichée, jamais la clé)", async () => {
    const { section } = monter({
      cles: [
        { fournisseur: "gemini", fin: "ppzA", ajouteLe: Date.UTC(2026, 9, 21, 12), valide: true },
      ],
    });
    await attendre();
    await attendre();
    const lignes = [...section.querySelectorAll(".ia-cle")];
    expect(lignes.map((l) => l.querySelector("strong").textContent)).toEqual([
      "OpenAI (GPT)",
      "Google (Gemini)",
    ]);
    expect(lignes[0].textContent).toContain("Pas de clé");
    expect(lignes[0].textContent).toContain("Ajouter ma clé");
    expect(lignes[1].textContent).toContain("…ppzA");
    expect(lignes[1].textContent).toContain("Remplacer");
    expect(lignes[1].textContent).toContain("Supprimer");
  });

  it("clé invalide : badge « À vérifier »", async () => {
    const { section } = monter({
      cles: [{ fournisseur: "openai", fin: "abcd", ajouteLe: 1, valide: false }],
    });
    await attendre();
    await attendre();
    expect(section.querySelector(".ia-cle-etat--alerte").textContent).toContain("À vérifier");
  });

  it("choisir un modèle pour un usage l'enregistre ; recommandations en un clic", async () => {
    const suggeres = [
      {
        fournisseur: "gemini",
        id: "gem-tags",
        nom: "Gem tags",
        usages: [],
        recommandePour: "tags",
      },
      {
        fournisseur: "gemini",
        id: "gem-chat",
        nom: "Gem chat",
        usages: [],
        recommandePour: "chat",
      },
      { fournisseur: "openai", id: "gpt-x", nom: "GPT X", usages: [], recommandePour: "recherche" },
    ];
    const { store, section } = monter({
      cles: [{ fournisseur: "gemini", fin: "ppzA", ajouteLe: 1, valide: true }],
      suggeres,
    });
    await attendre();
    await attendre();
    const check = section.querySelector("input[type=checkbox]");
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    // Seul le fournisseur dont on a la clé est proposé.
    const selectTags = section.querySelector('select[aria-label="Modèle pour Tags"]');
    const groupes = [...selectTags.querySelectorAll("optgroup")].map((g) => g.label);
    expect(groupes).toEqual(["Google (Gemini)"]);
    expect(selectTags.textContent).toContain("Gem tags (recommandé)");
    selectTags.value = "gemini|gem-chat";
    selectTags.dispatchEvent(new Event("change"));
    expect(iaDe(store.lire().reglages).usages.tags).toEqual({
      fournisseur: "gemini",
      modele: "gem-chat",
    });
    const reco = [...section.querySelectorAll("button")].find(
      (b) => b.textContent === "Utiliser les recommandations",
    );
    reco.click();
    expect(iaDe(store.lire().reglages).usages).toEqual({
      tags: { fournisseur: "gemini", modele: "gem-tags" },
      recherche: null,
      chat: { fournisseur: "gemini", modele: "gem-chat" },
    });
  });

  it("« Tester » affiche « OK · 820 ms »", async () => {
    const { store, section, service } = monter({
      cles: [{ fournisseur: "gemini", fin: "ppzA", ajouteLe: 1, valide: true }],
    });
    await attendre();
    await attendre();
    store.envoyer({
      type: "REGLAGES_MODIFIER",
      changements: {
        ia: {
          actif: true,
          usages: { tags: { fournisseur: "gemini", modele: "gem-x" }, recherche: null, chat: null },
          modelesPerso: [],
        },
      },
    });
    const ligne = section.querySelector(".ia-usage");
    ligne.querySelector("button").click();
    await attendre();
    await attendre();
    expect(service.tester).toHaveBeenCalledWith("gemini", "gem-x");
    expect(ligne.querySelector(".ia-test").textContent).toBe("OK · 820 ms");
  });

  it("guide en trois étapes quand l'assistant est activé sans aucune clé", async () => {
    const { section } = monter();
    await attendre();
    await attendre();
    expect(section.querySelector(".ia-guide")).toBeNull();
    const check = section.querySelector("input[type=checkbox]");
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    expect(section.querySelectorAll(".ia-guide li")).toHaveLength(3);
  });
});
