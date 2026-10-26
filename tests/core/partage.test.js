import { describe, expect, it, vi } from "vitest";
import { partagerFichier } from "../../src/platform/partage.js";

const fichier = new File(["{}"], "nedotab.json", { type: "application/json" });
const nav = (share, canShare = () => true) => ({ share, canShare });
const erreur = (name) => Object.assign(new Error(name), { name });

describe("partagerFichier", () => {
  it("partage quand le système sait partager des fichiers", async () => {
    const share = vi.fn().mockResolvedValue();
    const telecharger = vi.fn();
    expect(await partagerFichier(fichier, { nav: nav(share), telecharger })).toBe("partage");
    expect(share).toHaveBeenCalledWith({ files: [fichier], title: "Export NedoTab" });
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("télécharge si canShare dit non, ou s'il n'y a pas de partage", async () => {
    const telecharger = vi.fn();
    const share = vi.fn();
    expect(await partagerFichier(fichier, { nav: nav(share, () => false), telecharger })).toBe(
      "telecharge",
    );
    expect(await partagerFichier(fichier, { nav: {}, telecharger })).toBe("telecharge");
    expect(share).not.toHaveBeenCalled();
    expect(telecharger).toHaveBeenCalledTimes(2);
    expect(telecharger).toHaveBeenCalledWith(fichier, "nedotab.json", "application/json");
  });

  it("l'extension ne partage jamais (partage: false)", async () => {
    const share = vi.fn();
    const telecharger = vi.fn();
    await partagerFichier(fichier, { nav: nav(share), partage: false, telecharger });
    expect(share).not.toHaveBeenCalled();
    expect(telecharger).toHaveBeenCalled();
  });

  it("AbortError : silencieux, pas de téléchargement", async () => {
    const share = vi.fn().mockRejectedValue(erreur("AbortError"));
    const telecharger = vi.fn();
    expect(await partagerFichier(fichier, { nav: nav(share), telecharger })).toBe("annule");
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("NotAllowedError : bloqué (geste expiré), à refaire par un toucher", async () => {
    const share = vi.fn().mockRejectedValue(erreur("NotAllowedError"));
    const telecharger = vi.fn();
    expect(await partagerFichier(fichier, { nav: nav(share), telecharger })).toBe("bloque");
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("autre erreur : le fichier est téléchargé quand même", async () => {
    const share = vi.fn().mockRejectedValue(erreur("boom"));
    const telecharger = vi.fn();
    expect(await partagerFichier(fichier, { nav: nav(share), telecharger })).toBe("telecharge");
    expect(telecharger).toHaveBeenCalled();
  });
});
