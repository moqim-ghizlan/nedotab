import { describe, expect, it } from "vitest";
import { exemplesQuestions } from "../../src/core/exemplesQuestions.js";
import {
  apresSaisie,
  autreMode,
  compteurVisible,
  etatModes,
  modeApresTouche,
} from "../../src/core/modeRecherche.js";

describe("apresSaisie : le « ? » en premier caractère", () => {
  const base = { mode: "rechercher", actif: true };
  it("« ? » tapé dans un champ vide : mode question, « ? » retiré", () => {
    expect(apresSaisie({ ...base, avant: "", apres: "?" })).toEqual({
      mode: "demander",
      valeur: "",
    });
  });
  it("« ? » au milieu d'un texte ou collé avec du texte : rien", () => {
    expect(apresSaisie({ ...base, avant: "abc", apres: "abc?" })).toEqual({
      mode: "rechercher",
      valeur: "abc?",
    });
    expect(apresSaisie({ ...base, avant: "", apres: "?abc" })).toEqual({
      mode: "rechercher",
      valeur: "?abc",
    });
  });
  it("déjà en mode question, ou IA indisponible : le « ? » reste du texte", () => {
    expect(apresSaisie({ mode: "demander", actif: true, avant: "", apres: "?" }).valeur).toBe("?");
    expect(apresSaisie({ ...base, actif: false, avant: "", apres: "?" })).toEqual({
      mode: "rechercher",
      valeur: "?",
    });
  });
});

describe("modeApresTouche", () => {
  const base = { mode: "rechercher", touche: "Tab", valeurVide: true, actif: true };
  it("Tab dans le champ vide bascule, pas dans un champ rempli", () => {
    expect(modeApresTouche(base)).toBe("demander");
    expect(modeApresTouche({ ...base, valeurVide: false })).toBeNull();
    expect(modeApresTouche({ ...base, mode: "demander" })).toBe("rechercher");
  });
  it("Maj+Tab et Ctrl+Tab gardent leur rôle", () => {
    expect(modeApresTouche({ ...base, maj: true })).toBeNull();
    expect(modeApresTouche({ ...base, ctrl: true })).toBeNull();
  });
  it("Ctrl/Cmd+J bascule à tout moment", () => {
    const j = { ...base, touche: "j", ctrl: true, valeurVide: false };
    expect(modeApresTouche(j)).toBe("demander");
    expect(modeApresTouche({ ...j, mode: "demander" })).toBe("rechercher");
    expect(modeApresTouche({ ...j, touche: "J" })).toBe("demander");
  });
  it("Retour arrière dans le champ vide : on quitte le mode question", () => {
    const r = { ...base, touche: "Backspace", mode: "demander" };
    expect(modeApresTouche(r)).toBe("rechercher");
    expect(modeApresTouche({ ...r, valeurVide: false })).toBeNull();
    expect(modeApresTouche({ ...r, mode: "rechercher" })).toBeNull();
  });
  it("IA indisponible : aucune touche ne fait rien", () => {
    expect(modeApresTouche({ ...base, actif: false })).toBeNull();
    expect(modeApresTouche({ ...base, actif: false, touche: "j", ctrl: true })).toBeNull();
  });
  it("autreMode", () => {
    expect(autreMode("rechercher")).toBe("demander");
    expect(autreMode("demander")).toBe("rechercher");
  });
});

describe("etatModes : selon iaPrete", () => {
  it("prête : sélecteur et envoi", () => {
    expect(etatModes({ prete: true })).toMatchObject({ afficher: true, envoi: true });
  });
  it("désactivée ou mode local : aucune trace", () => {
    for (const raison of ["desactivee", "mode-local"])
      expect(etatModes({ prete: false, raison })).toMatchObject({ afficher: false, envoi: false });
    expect(etatModes(null).afficher).toBe(false);
  });
  it("pas de clé : sélecteur affiché, message avec lien vers les réglages", () => {
    expect(etatModes({ prete: false, raison: "pas-de-cle" })).toEqual({
      afficher: true,
      envoi: false,
      message: "Configurez l'assistant IA",
      action: "reglages",
    });
  });
  it("hors ligne : sélecteur affiché, envoi désactivé", () => {
    expect(etatModes({ prete: false, raison: "hors-ligne" })).toMatchObject({
      afficher: true,
      envoi: false,
      message: "Connexion Internet nécessaire",
      action: null,
    });
  });
  it("compteur à partir de 400 caractères", () => {
    expect(compteurVisible(399)).toBe(false);
    expect(compteurVisible(400)).toBe(true);
  });
});

describe("exemplesQuestions", () => {
  const site = (id, tags) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, tags });
  it("à partir des tags les plus fréquents, 3 au plus", () => {
    const g = [
      site("a", ["design", "cuisine"]),
      site("b", ["design", "cuisine", "dev"]),
      site("c", ["design", "sport", "dev", "photo"]),
    ];
    const e = exemplesQuestions(g);
    expect(e).toHaveLength(3);
    expect(e[0]).toContain("design");
    expect(e[1]).toContain("cuisine");
    expect(e[2]).toContain("dev");
  });
  it("sans tags : exemples génériques ; avec un seul tag : complété", () => {
    expect(exemplesQuestions([])).toHaveLength(3);
    const un = exemplesQuestions([site("a", ["design"])]);
    expect(un).toHaveLength(3);
    expect(un[0]).toContain("design");
  });
});
