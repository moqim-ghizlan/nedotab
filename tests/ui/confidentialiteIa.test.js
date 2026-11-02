// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { effacerTagsGeneres } from "../../src/core/effacement.js";
import { avecConfidentialite, iaDe } from "../../src/core/ia.js";
import { creerSite, etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";

const appelerIa = vi.fn();
vi.mock("../../src/firebase/charger.js", () => ({ chargerFirebase: async () => ({ appelerIa }) }));
const { creerSectionConfidentialite } = await import("../../src/ui/reglages/confidentialiteIa.js");
const { creerEcranRangement } = await import("../../src/ui/rangement/ecran.js");

const site = (id, extra = {}) => ({ ...creerSite({ id, titre: id, url: `https://${id}.fr`, creeLe: 1 }), ...extra });
const vider = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};

beforeEach(() => {
  appelerIa.mockReset();
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

function monter(grille = [], ia = { actif: true }) {
  document.body.replaceChildren();
  const store = creerStore(
    { ...etatInitial(), grille, reglages: { ...etatInitial().reglages, ia } },
    reduire,
  );
  const { section } = creerSectionConfidentialite({ store });
  document.body.append(section);
  return { store, section };
}
/** Clicks "Effacer" then confirms in the dialog. */
async function effacer(id, valider = true) {
  document.querySelector(`#effacer-${id}`).click();
  await vider();
  const boutons = [...document.querySelectorAll("dialog button")];
  boutons.find((b) => (valider ? /^Effacer$/ : /^Annuler$/).test(b.textContent)).click();
  await vider();
}

describe("effacerTagsGeneres", () => {
  it("vide les tags générés, garde ceux écrits à la main, ne touche pas aux autres sites", () => {
    const g = [
      site("ia", { tags: ["a"], description: "d", ia: { etat: "ok", majLe: 1 } }),
      site("main", { tags: ["b"], tagsManuels: true }),
      site("rien"),
      { id: "d", type: "dossier", titre: "D", items: [site("dedans", { tags: ["c"] })] },
    ];
    const r = effacerTagsGeneres(g);
    expect(r.efface).toBe(2);
    expect(r.grille[0]).toMatchObject({ tags: [], description: "", ia: { etat: "aucun" } });
    expect(r.grille[1].tags).toEqual(["b"]);
    expect(r.grille[2]).toBe(g[2]);
    expect(r.grille[3].items[0].tags).toEqual([]);
    expect(effacerTagsGeneres([site("x")]).efface).toBe(0);
  });
});

describe("section Confidentialité de l'IA", () => {
  it("tout est coché par défaut ; décocher enregistre le refus, recocher le retire", () => {
    const m = monter();
    const cases = [...m.section.querySelectorAll("input[type=checkbox]")];
    expect(cases).toHaveLength(6);
    expect(cases.every((c) => c.checked)).toBe(true);
    const chemins = m.section.querySelector("#conf-chemins");
    chemins.checked = false;
    chemins.dispatchEvent(new Event("change"));
    expect(iaDe(m.store.lire().reglages).confidentialite).toEqual({ chemins: false });
    m.section.querySelector("#conf-historique").checked = false;
    m.section.querySelector("#conf-historique").dispatchEvent(new Event("change"));
    expect(iaDe(m.store.lire().reglages).confidentialite).toEqual({ chemins: false, historique: false });
    m.section.querySelector("#conf-chemins").checked = true;
    m.section.querySelector("#conf-chemins").dispatchEvent(new Event("change"));
    expect(iaDe(m.store.lire().reglages).confidentialite).toEqual({ historique: false });
  });

  it("reflète les réglages venus d'un autre appareil", () => {
    const m = monter();
    m.store.envoyer({
      type: "REGLAGES_MODIFIER",
      changements: { ia: avecConfidentialite(iaDe(m.store.lire().reglages), "lirePages", false) },
    });
    expect(m.section.querySelector("#conf-lirePages").checked).toBe(false);
  });

  it("une phrase dit ce que l'assistant reçoit et suit les réglages", () => {
    const m = monter();
    const dit = () => m.section.querySelector(".ia-conf-phrase").textContent;
    expect(dit()).toMatch(/reçoit de vos sites : titres, adresses, tags, descriptions et noms de dossiers\./);
    const bascule = (cle, autorise) => {
      const c = m.section.querySelector(`#conf-${cle}`);
      c.checked = autorise;
      c.dispatchEvent(new Event("change"));
    };
    bascule("chemins", false);
    expect(dit()).toMatch(/reçoit de vos sites : titres, adresses, tags et descriptions\./);
    expect(dit()).toMatch(/Il ne reçoit pas : noms de dossiers\./);
    bascule("titresAdresses", false);
    expect(dit()).toMatch(/ne reçoit rien sur vos sites/);
    expect(dit()).toMatch(/messages au chat lui sont toujours transmis/);
    expect(m.section.querySelector(".ia-conf-etat").textContent).toBe("2 limités");
  });

  it("les réglages sont groupés (sites, pages web, conversations) et gardent le focus", () => {
    const m = monter();
    expect([...m.section.querySelectorAll(".ia-conf-groupe-titre")].map((h) => h.textContent)).toEqual([
      "Vos sites",
      "Pages web",
      "Conversations",
      "Effacer mes données",
    ]);
    const c = m.section.querySelector("#conf-tagsDescriptions");
    document.body.append(m.section);
    c.focus();
    c.checked = false;
    c.dispatchEvent(new Event("change"));
    expect(document.activeElement.id).toBe("conf-tagsDescriptions");
    expect(m.section.querySelector(".ia-conf-etat").textContent).toBe("1 limité");
  });

  it("l'effacement le plus large est à part et nommé comme tel", () => {
    const m = monter();
    const lignes = [...m.section.querySelectorAll(".ia-conf-effacement")];
    expect(lignes).toHaveLength(6);
    expect(lignes.filter((l) => l.classList.contains("ia-conf-effacement--danger"))).toHaveLength(1);
    expect(lignes.at(-1).querySelector("strong").textContent).toBe("Tout effacer et désactiver l'IA");
    expect(m.section.querySelector("#effacer-cache").getAttribute("aria-label")).toBe("Effacer : Cache de l'IA");
  });

  it("compte les sites masqués", () => {
    const m = monter([site("a", { iaExclu: true }), site("b")]);
    expect(m.section.textContent).toMatch(/1 site masqué à l'IA/);
    expect(monter([site("a")]).section.textContent).toMatch(/Aucun site masqué/);
  });

  it("chaque effacement demande confirmation (définitif, exporter avant) et n'appelle rien si on annule", async () => {
    monter();
    document.querySelector("#effacer-conversations").click();
    await vider();
    const dialogue = document.querySelector("dialog");
    expect(dialogue.textContent).toMatch(/définitive/);
    expect(dialogue.textContent).toMatch(/exporter vos données avant/);
    [...dialogue.querySelectorAll("button")].find((b) => /Annuler/.test(b.textContent)).click();
    await vider();
    expect(appelerIa).not.toHaveBeenCalled();
  });

  it.each([
    ["conversations", "conversations"],
    ["cache", "cache"],
    ["usage", "usage"],
  ])("« %s » : confirmé, une seule fonction appelée avec exactement ce qui est annoncé", async (id, quoi) => {
    appelerIa.mockResolvedValue({});
    monter();
    await effacer(id);
    expect(appelerIa.mock.calls).toEqual([["iaEffacer", { quoi }]]);
  });

  it("tags générés : effacés dans la grille, annulables ; clés : supprimées une à une", async () => {
    const m = monter([site("a", { tags: ["x"], description: "d", ia: { etat: "ok", majLe: 1 } })]);
    await effacer("tags");
    expect(m.store.lire().grille[0].tags).toEqual([]);
    expect(appelerIa).not.toHaveBeenCalled();
    appelerIa.mockImplementation(async (nom) => (nom === "iaEtatCles" ? [{ fournisseur: "gemini" }] : {}));
    await effacer("cles");
    expect(appelerIa.mock.calls).toEqual([["iaEtatCles", undefined], ["iaSupprimerCle", { fournisseur: "gemini" }]]);
  });

  it("tout effacer : serveur, tags, clés, puis l'IA est désactivée", async () => {
    appelerIa.mockImplementation(async (nom) => (nom === "iaEtatCles" ? [{ fournisseur: "gemini" }] : {}));
    const m = monter([site("a", { tags: ["x"], ia: { etat: "ok", majLe: 1 } })]);
    await effacer("tout");
    expect(appelerIa.mock.calls.map((c) => c[0])).toEqual(["iaEffacer", "iaEtatCles", "iaSupprimerCle"]);
    expect(appelerIa.mock.calls[0][1]).toEqual({ quoi: "serveur" });
    expect(m.store.lire().grille[0].tags).toEqual([]);
    expect(iaDe(m.store.lire().reglages).actif).toBe(false);
  });

  it("erreur du serveur : l'IA reste active, rien d'autre n'est effacé", async () => {
    appelerIa.mockRejectedValue({ code: "functions/unavailable" });
    const m = monter([site("a", { tags: ["x"], ia: { etat: "ok", majLe: 1 } })]);
    await effacer("tout");
    expect(m.store.lire().grille[0].tags).toEqual(["x"]);
    expect(iaDe(m.store.lire().reglages).actif).toBe(true);
  });
});

describe("mode sans IA", () => {
  it("l'écran « Ranger mes sites » n'a pas d'onglet Suggestions, et ne fait aucun appel", async () => {
    document.body.replaceChildren();
    const store = creerStore({ ...etatInitial(), grille: [site("a"), site("b")] }, reduire);
    const ecran = creerEcranRangement({ store, enCompte: () => true, iaActive: () => false });
    document.body.append(ecran.racine);
    expect([...ecran.racine.querySelectorAll(".rangement-onglet")].map((b) => b.textContent)).toEqual([
      "Doublons (0)",
      "Sites à vérifier",
    ]);
    await vider();
    expect(appelerIa).not.toHaveBeenCalled();
  });

  it("IA allumée : l'onglet Suggestions est là", () => {
    document.body.replaceChildren();
    const store = creerStore({ ...etatInitial(), grille: [] }, reduire);
    const ecran = creerEcranRangement({ store, iaActive: () => true });
    expect(ecran.racine.querySelectorAll(".rangement-onglet")).toHaveLength(3);
  });
});
