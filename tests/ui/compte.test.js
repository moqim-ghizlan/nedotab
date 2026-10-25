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

  describe("application web : connexion par redirection (V3.2)", () => {
    const redirection = (opts) => {
      const f = fausse(opts);
      f.plat.capacites = { connexion: "redirection" };
      f.fb.terminerConnexion = vi.fn(async () => ({ uid: "u1", nom: "Alice", email: "a@x.fr" }));
      f.fb.reconnecterPourConfirmer = vi.fn(async () => ({ uid: "u1" }));
      return f;
    };
    it("avant de partir chez Google : marqueur posé", async () => {
      const f = redirection();
      f.fb.connecter.mockImplementationOnce(() => new Promise(() => {})); // page quittée
      const compte = creerCompte({ charger: f.charger, plat: f.plat });
      compte.connecter();
      await vi.waitFor(() =>
        expect(f.prefs.connexionEnAttente).toMatchObject({ but: "connexion" }),
      );
      expect(compte.lire().statut).toBe("connexion");
    });
    it("au retour : connexion terminée, marqueur effacé, indicateur écrit", async () => {
      const f = redirection();
      f.prefs.connexionEnAttente = { but: "connexion", le: Date.now() };
      const compte = creerCompte({ charger: f.charger, plat: f.plat });
      expect(await compte.demarrer()).toBe("connexion");
      expect(compte.lire()).toMatchObject({ statut: "connecte", profil: { uid: "u1" } });
      expect(f.prefs.connexionEnAttente).toBeNull();
      expect(f.prefs.compte).toMatchObject({ connecte: true, uid: "u1" });
    });
    it("revenu sans se connecter : déconnecté, sans message", async () => {
      const f = redirection();
      f.fb.terminerConnexion.mockResolvedValueOnce(null);
      f.prefs.connexionEnAttente = { but: "connexion", le: Date.now() };
      const compte = creerCompte({ charger: f.charger, plat: f.plat });
      expect(await compte.demarrer()).toBeNull();
      expect(compte.lire()).toMatchObject({ statut: "deconnecte", erreur: null });
    });
    it("domaine non autorisé : message lisible", async () => {
      const f = redirection();
      f.fb.terminerConnexion.mockRejectedValueOnce({ code: "auth/unauthorized-domain" });
      f.prefs.connexionEnAttente = { but: "connexion", le: Date.now() };
      const compte = creerCompte({ charger: f.charger, plat: f.plat });
      vi.spyOn(console, "error").mockImplementationOnce(() => {});
      await compte.demarrer();
      expect(compte.lire()).toMatchObject({ statut: "deconnecte" });
      expect(compte.lire().erreur).toMatch(/pas autorisée/);
    });
    it("marqueur trop ancien : ignoré, Firebase non chargé", async () => {
      const f = redirection();
      f.prefs.connexionEnAttente = { but: "connexion", le: Date.now() - 60 * 60 * 1000 };
      const compte = creerCompte({ charger: f.charger, plat: f.plat });
      expect(await compte.demarrer()).toBeNull();
      expect(f.charger).not.toHaveBeenCalled();
      expect(f.prefs.connexionEnAttente).toBeNull();
    });
    it("confirmation avec une connexion récente : pas de redirection", async () => {
      const f = redirection({ indicateur: { connecte: true, uid: "u1" } });
      const compte = creerCompte({ charger: f.charger, plat: f.plat });
      await compte.demarrer();
      expect(await compte.reconnecter()).toBe(true);
      expect(f.prefs.connexionEnAttente).toBeNull();
    });
  });
});
