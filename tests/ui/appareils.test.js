import { afterEach, describe, expect, it, vi } from "vitest";
import { creerServiceAppareils } from "../../src/ui/services/appareils.js";
import { creerBlocAppareils } from "../../src/ui/reglages/appareils.js";

afterEach(() => document.body.replaceChildren());
const attendre = () => new Promise((r) => setTimeout(r, 0));

function monter({ choix = { mode: "nom", nom: "Maison" } } = {}) {
  let rappel = null;
  const fb = {
    definirIdentiteAppareil: vi.fn(),
    ecouterAppareils: (_u, f) => {
      rappel = f;
      return () => {};
    },
    enregistrerAppareil: vi.fn(async () => {}),
    renommerAppareilDistant: vi.fn(async () => {}),
    retirerAppareilDistant: vi.fn(async () => {}),
    toucherAppareil: vi.fn(async () => {}),
  };
  const preferences = { ecrire: vi.fn(async () => {}) };
  const demanderNom = vi.fn(async () => choix);
  const service = creerServiceAppareils({
    charger: async () => fb,
    uid: () => "u1",
    idAppareil: async () => "id-local",
    preferences,
    demanderNom,
    type: "extension",
  });
  return { service, fb, preferences, demanderNom, envoyer: (l, m = {}) => rappel(l, { depuisCache: false, ...m }) };
}

describe("appareils : premier lancement", () => {
  it("propose un nom et enregistre l'appareil inconnu", async () => {
    const m = monter();
    await m.service.demarrer();
    m.envoyer([{ id: "autre", nom: "Chrome", type: "extension" }]);
    await attendre();
    await attendre();
    expect(m.demanderNom.mock.calls[0][0].suggestion).toBe("Chrome 2");
    expect(m.fb.enregistrerAppareil).toHaveBeenCalledWith("u1", { id: "id-local", nom: "Maison", type: "extension" });
  });
  it("ne demande rien tant que seul le cache répond", async () => {
    const m = monter();
    await m.service.demarrer();
    m.envoyer([], { depuisCache: true });
    await attendre();
    expect(m.demanderNom).not.toHaveBeenCalled();
  });
  it("« déjà dans ma liste » reprend l'identifiant existant", async () => {
    const m = monter({ choix: { mode: "reprendre", id: "ancien" } });
    await m.service.demarrer();
    m.envoyer([{ id: "ancien", nom: "work-pc", type: "extension" }]);
    await attendre();
    await attendre();
    expect(m.preferences.ecrire).toHaveBeenCalledWith("idAppareil", "ancien");
    expect(m.service.id()).toBe("ancien");
    expect(m.fb.enregistrerAppareil).not.toHaveBeenCalled();
  });
  it("appareil déjà connu : rien n'est demandé", async () => {
    const m = monter();
    await m.service.demarrer();
    m.envoyer([{ id: "id-local", nom: "Maison", type: "extension", vuLe: Date.now() }]);
    await attendre();
    expect(m.demanderNom).not.toHaveBeenCalled();
    expect(m.service.nom()).toBe("Maison");
  });
  it("refuse un doublon au renommage et ne retire pas l'appareil courant", async () => {
    const m = monter();
    await m.service.demarrer();
    m.envoyer([
      { id: "id-local", nom: "Maison", type: "extension", vuLe: Date.now() },
      { id: "x", nom: "Travail", type: "ipad" },
    ]);
    expect((await m.service.renommer("id-local", "travail")).ok).toBe(false);
    expect((await m.service.retirer("id-local")).ok).toBe(false);
    expect((await m.service.retirer("x")).ok).toBe(true);
  });
});

describe("Mes appareils (réglages)", () => {
  it("affiche les noms en texte brut et la ligne « Cet appareil »", async () => {
    const m = monter();
    await m.service.demarrer();
    m.envoyer([
      { id: "id-local", nom: "Maison", type: "extension", vuLe: Date.now() },
      { id: "x", nom: "<img src=x onerror=alert(1)>", type: "ipad" },
    ]);
    const bloc = creerBlocAppareils({ appareils: m.service });
    document.body.append(bloc);
    expect(bloc.querySelector(".appareil-ici .appareil-nom").textContent).toBe("Maison");
    expect(bloc.querySelector(".appareils-liste img")).toBeNull();
    expect(bloc.querySelector(".appareils-liste .appareil-nom").textContent).toContain("<img");
  });
});
