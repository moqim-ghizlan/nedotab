import { describe, expect, it, vi } from "vitest";
import { creerCompte } from "../../src/ui/services/compte.js";

class ConnexionAnnulee extends Error {}
class ConnexionIndisponible extends Error {}

function fausse({ indicateur = null } = {}) {
  const prefs = { compte: indicateur };
  const plat = {
    ConnexionAnnulee,
    ConnexionIndisponible,
    preferences: {
      lire: vi.fn(async (c) => prefs[c]),
      ecrire: vi.fn(async (c, v) => (prefs[c] = v)),
    },
    obtenirJetonGoogle: vi.fn(),
    oublierJetonGoogle: vi.fn(),
  };
  const fb = {
    connecter: vi.fn(async () => ({ uid: "u1", nom: "Alice", email: "a@x.fr", photo: "" })),
    deconnecter: vi.fn(async () => {}),
    ecouterUtilisateur: vi.fn(() => () => {}),
  };
  const charger = vi.fn(async () => fb);
  return { plat, fb, charger, prefs };
}

describe("compte", () => {
  it("sans indicateur au démarrage : Firebase n'est pas chargé", async () => {
    const f = fausse();
    const compte = creerCompte({ charger: f.charger, plat: f.plat });
    await compte.demarrer();
    expect(f.charger).not.toHaveBeenCalled();
    expect(compte.lire().statut).toBe("deconnecte");
  });
  it("avec indicateur : profil affiché tout de suite, session restaurée en arrière-plan", async () => {
    const f = fausse({
      indicateur: { connecte: true, uid: "u1", nom: "Alice", email: "a@x.fr", photo: "" },
    });
    const compte = creerCompte({ charger: f.charger, plat: f.plat });
    await compte.demarrer();
    expect(compte.lire()).toMatchObject({ statut: "connecte", profil: { nom: "Alice" } });
    expect(compte.lire().profil).not.toHaveProperty("connecte");
    await vi.waitFor(() => expect(f.fb.ecouterUtilisateur).toHaveBeenCalled());
  });
  it("connexion : profil et indicateur enregistrés", async () => {
    const f = fausse();
    const compte = creerCompte({ charger: f.charger, plat: f.plat });
    await compte.connecter();
    expect(compte.lire().statut).toBe("connecte");
    expect(f.prefs.compte).toMatchObject({ connecte: true, uid: "u1" });
  });
  it("fenêtre fermée par l'utilisateur : aucun message", async () => {
    const f = fausse();
    f.fb.connecter.mockRejectedValueOnce(new ConnexionAnnulee("closed"));
    const compte = creerCompte({ charger: f.charger, plat: f.plat });
    await compte.connecter();
    expect(compte.lire()).toMatchObject({ statut: "deconnecte", erreur: null });
  });
  it("navigateur non compatible : message clair", async () => {
    const f = fausse();
    f.fb.connecter.mockRejectedValueOnce(new ConnexionIndisponible("x"));
    const compte = creerCompte({ charger: f.charger, plat: f.plat });
    await compte.connecter();
    expect(compte.lire().erreur).toMatch(/uniquement|que dans Google Chrome/);
  });
  it("déconnexion : indicateur effacé", async () => {
    const f = fausse({ indicateur: { connecte: true, uid: "u1" } });
    const compte = creerCompte({ charger: f.charger, plat: f.plat });
    await compte.deconnecter();
    expect(f.prefs.compte).toBeNull();
    expect(compte.lire().statut).toBe("deconnecte");
  });
});
