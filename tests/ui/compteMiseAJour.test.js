import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirMiseAJour } from "../../src/ui/etatMiseAJour.js";
import { sectionCompte } from "../../src/ui/reglages/compte.js";

function monter() {
  const rappels = new Set();
  const compte = {
    lire: () => ({
      statut: "connecte",
      profil: { nom: "Alice", email: "a@x.fr", photo: "" },
    }),
    abonner: (f) => (rappels.add(f), () => rappels.delete(f)),
  };
  const synchro = { lire: () => ({ mode: "compte" }), abonner: () => () => {} };
  const session = {
    compte,
    synchro,
    synchroniser: vi.fn(),
    restaurerCopie: vi.fn(),
    deconnecter: vi.fn(),
  };
  const carte = sectionCompte(session);
  document.body.replaceChildren(carte.section);
  const boutons = () =>
    [...carte.section.querySelectorAll(".carte-action")].map((b) => b.textContent);
  return { carte, boutons, session };
}

describe("carte du compte : mise à jour de l'application", () => {
  beforeEach(() => definirMiseAJour({ disponible: false, appliquer: null }));

  it("pas de mise à jour : le bouton n'est pas là", () => {
    expect(monter().boutons()).toEqual(["Restaurer la copie", "Se déconnecter"]);
  });

  it("une mise à jour arrive après l'ouverture : le bouton apparaît, en tête, et recharge", () => {
    const m = monter();
    const appliquer = vi.fn(async () => {});
    definirMiseAJour({ disponible: true, appliquer });
    expect(m.boutons()).toEqual([
      "Mettre à jour l'application",
      "Restaurer la copie",
      "Se déconnecter",
    ]);
    m.carte.section.querySelector(".carte-action").click();
    expect(appliquer).toHaveBeenCalledTimes(1);
  });

  it("déjà disponible à l'ouverture (bandeau fermé avant) : le bouton est là", () => {
    definirMiseAJour({ disponible: true, appliquer: async () => {} });
    expect(monter().boutons()[0]).toBe("Mettre à jour l'application");
  });

  it("la fermeture du panneau arrête d'écouter", () => {
    const m = monter();
    m.carte.arreter();
    definirMiseAJour({ disponible: true, appliquer: async () => {} });
    expect(m.boutons()).not.toContain("Mettre à jour l'application");
  });
});
