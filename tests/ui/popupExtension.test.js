import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION_SCHEMA } from "../../src/core/constantes.js";
import { ouvrirChat } from "../../src/ui/popup/chatLateral.js";
import { demarrerPopup } from "../../src/ui/popup/popup.js";

// V4.29: the toolbar window, with a simulated chrome.* (storage, tabs, runtime, sidePanel).
const attendre = async (cond) => {
  for (let i = 0; i < 1000 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(Boolean(cond())).toBe(true);
};
const bouton = (racine, texte) =>
  [...racine.querySelectorAll("button")].find((b) => b.textContent === texte) ??
  [...racine.querySelectorAll("button")].find((b) => b.textContent.startsWith(texte));

function installerChrome({ tab, grille = [], sidePanel = true } = {}) {
  const donnees = {};
  const ecouteurs = [];
  const local = {
    get: async (k) =>
      k === null
        ? { ...donnees }
        : typeof k === "string"
          ? { [k]: donnees[k] }
          : Object.fromEntries(Object.entries(donnees).filter(([c]) => [].concat(k).includes(c))),
    set: async (o) => {
      Object.assign(donnees, structuredClone(o));
      ecouteurs.forEach((f) =>
        f(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { newValue: v }])), "local"),
      );
    },
    remove: async (k) => [].concat(k).forEach((c) => delete donnees[c]),
  };
  globalThis.chrome = {
    storage: {
      local,
      onChanged: { addListener: (f) => ecouteurs.push(f), removeListener: () => {} },
    },
    tabs: { query: vi.fn(async () => (tab ? [tab] : [])), create: vi.fn() },
    runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
    permissions: { contains: async () => false },
    ...(sidePanel ? { sidePanel: { open: vi.fn(async () => {}) } } : {}),
  };
  return { donnees, grille };
}

describe("fenêtre de la barre d'outils", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="popup"></div>';
    window.close = vi.fn();
    globalThis.fetch = vi.fn(async () => {
      throw new Error("hors ligne");
    });
  });

  it("deux choix, onglet affiché (titre et domaine)", async () => {
    installerChrome({
      tab: { url: "https://www.exemple.org/page", title: "Mon exemple", windowId: 7 },
    });
    const racine = document.getElementById("popup");
    await demarrerPopup(racine);
    expect(racine.textContent).toContain("Mon exemple");
    expect(racine.textContent).toContain("exemple.org");
    expect(bouton(racine, "Ajouter ce site")).toBeTruthy();
    expect(bouton(racine, "Ouvrir le chat")).toBeTruthy();
  });

  it("page chrome:// : ajout refusé avec explication, chat disponible", async () => {
    installerChrome({ tab: { url: "chrome://extensions", title: "Extensions", windowId: 1 } });
    const racine = document.getElementById("popup");
    await demarrerPopup(racine);
    expect(bouton(racine, "Ajouter ce site").disabled).toBe(true);
    expect(racine.textContent).toContain("ne peut pas être ajoutée");
    expect(bouton(racine, "Ouvrir le chat").disabled).toBe(false);
  });

  it(
    "ajoute le site dans un sous-dossier, écrit tout de suite, mémorise le dossier",
    { timeout: 20000 },
    async () => {
      const c = installerChrome({
        tab: { url: "https://nouveau.fr/", title: "Nouveau", windowId: 1 },
      });
      // Existing state: Travail › Clients
      const { creerStockage } = await import("../../src/platform/stockageChrome.js");
      const st = creerStockage(
        globalThis.chrome.storage.local,
        globalThis.chrome.storage.onChanged,
      );
      await st.sauvegarder({
        versionSchema: VERSION_SCHEMA,
        grille: [
          {
            id: "d1",
            type: "dossier",
            titre: "Travail",
            creeLe: 1,
            items: [{ id: "d2", type: "dossier", titre: "Clients", creeLe: 1, items: [] }],
          },
        ],
        reglages: {},
      });
      const racine = document.getElementById("popup");
      await demarrerPopup(racine);
      bouton(racine, "Ajouter ce site").click();
      await attendre(() => racine.querySelector("#p-lieu"));
      const lieu = racine.querySelector("#p-lieu");
      expect([...lieu.options].map((o) => o.textContent.trim())).toEqual([
        "Accueil",
        "Travail",
        "Travail › Clients",
      ]);
      lieu.value = "d2";
      bouton(racine, "Ajouter").click();
      await attendre(() => racine.textContent.includes("Ajouté à Travail › Clients"));
      const apres = await st.lire();
      const clients = apres.etat.grille[0].items[0];
      expect(clients.items).toHaveLength(1);
      expect(clients.items[0]).toMatchObject({ type: "site", url: "https://nouveau.fr" });
      expect(c.donnees["pref:dernierDossierAjout"]).toBe("d2");
    },
  );

  it("site déjà enregistré : bandeau, pas de doublon silencieux", async () => {
    installerChrome({ tab: { url: "https://www.vu.fr", title: "Vu", windowId: 1 } });
    const { creerStockage } = await import("../../src/platform/stockageChrome.js");
    const st = creerStockage(globalThis.chrome.storage.local, globalThis.chrome.storage.onChanged);
    await st.sauvegarder({
      versionSchema: VERSION_SCHEMA,
      grille: [
        {
          id: "s1",
          type: "site",
          titre: "Vu",
          url: "https://vu.fr",
          creeLe: 1,
          icone: { type: "lettre", couleur: "#000" },
        },
      ],
      reglages: {},
    });
    const racine = document.getElementById("popup");
    await demarrerPopup(racine);
    bouton(racine, "Ajouter ce site").click();
    await attendre(() => racine.querySelector(".popup-bandeau"));
    expect(racine.textContent).toContain("Déjà dans Accueil");
    expect(bouton(racine, "Ajouter").disabled).toBe(true);
    bouton(racine, "Ajouter quand même").click();
    expect(bouton(racine, "Ajouter").disabled).toBe(false);
  });

  it("annuler (Échap/Annuler) n'ajoute rien", async () => {
    const c = installerChrome({ tab: { url: "https://x.fr", title: "X", windowId: 1 } });
    const racine = document.getElementById("popup");
    await demarrerPopup(racine);
    bouton(racine, "Ajouter ce site").click();
    await attendre(() => bouton(racine, "Annuler"));
    bouton(racine, "Annuler").click();
    expect(window.close).toHaveBeenCalled();
    expect(Object.keys(c.donnees).some((k) => k.includes("etat") || k === "nedotab")).toBe(false);
  });
});

describe("Ouvrir le chat", () => {
  it("appelle sidePanel.open directement dans le clic, avec la fenêtre de l'onglet", () => {
    installerChrome({ tab: null });
    ouvrirChat.windowId = 7;
    const fermer = vi.fn();
    ouvrirChat({ chromeApi: globalThis.chrome, fenetre: { close: fermer } });
    expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
  });
  it("sidePanel absent : le chat s'ouvre dans un onglet NedoTab", () => {
    installerChrome({ tab: null, sidePanel: false });
    const fermer = vi.fn();
    ouvrirChat({ chromeApi: globalThis.chrome, fenetre: { close: fermer } });
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://abc/newtab.html?panneau=chat",
    });
    expect(fermer).toHaveBeenCalled();
  });
});
