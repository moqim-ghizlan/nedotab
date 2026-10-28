import { describe, expect, it } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { avecActif, iaAStocker, iaParDefaut, iaPrete, validerIa } from "../../src/core/ia.js";
import { etatInitial } from "../../src/core/modele.js";
import { validerReglages } from "../../src/core/reglages.js";

describe("réglages", () => {
  it("par défaut : désactivé, rien n'est stocké", () => {
    expect(iaParDefaut()).toEqual({ actif: false });
    expect(iaAStocker(iaParDefaut())).toBeUndefined();
    expect(validerReglages({}).ia).toBeUndefined();
  });

  it("les champs des anciennes versions (usages, modèles perso) sont ignorés", () => {
    const vieux = {
      actif: true,
      usages: { tags: { fournisseur: "openai", modele: "gpt-x" } },
      modelesPerso: [{ fournisseur: "gemini", id: "m", nom: "M" }],
    };
    expect(validerIa(vieux)).toEqual({ actif: true });
    expect(iaAStocker(vieux)).toEqual({ actif: true });
  });

  it("changement par l'action REGLAGES_MODIFIER : validé, synchronisé, sans clé", () => {
    let etat = etatInitial();
    const ia = avecActif(iaParDefaut(), true);
    etat = reduire(etat, { type: "REGLAGES_MODIFIER", changements: { ia } });
    expect(etat.reglages.ia).toEqual({ actif: true });
    expect(JSON.stringify(etat.reglages)).not.toMatch(/cle|key|secret/i);
    // La liste blanche refuse une clé glissée dans les réglages IA.
    const piege = reduire(etat, {
      type: "REGLAGES_MODIFIER",
      changements: { ia: { ...ia, cle: "sk-secret" } },
    });
    expect(JSON.stringify(piege.reglages)).not.toContain("sk-secret");
    // Revenir au défaut efface le champ.
    const retour = reduire(etat, { type: "REGLAGES_MODIFIER", changements: { ia: iaParDefaut() } });
    expect(retour.reglages.ia).toBeUndefined();
  });

  it("réglages abîmés dans le stockage : retour aux valeurs par défaut", () => {
    expect(validerReglages({ ia: { actif: "oui" } }).ia).toBeUndefined();
  });
});

describe("iaPrete : tous les cas", () => {
  const cles = [{ fournisseur: "gemini", valide: true }];
  const base = { ia: avecActif(iaParDefaut(), true), modeCompte: true, enLigne: true, cles };

  it("prête", () => {
    expect(iaPrete(base)).toEqual({ prete: true });
  });
  it.each([
    [{ modeCompte: false }, "mode-local"],
    [{ ia: iaParDefaut() }, "desactivee"],
    [{ cles: [] }, "pas-de-cle"],
    [{ cles: [{ fournisseur: "openai", valide: true }] }, "pas-de-cle"],
    [{ cles: [{ fournisseur: "gemini", valide: false }] }, "pas-de-cle"],
    [{ enLigne: false }, "hors-ligne"],
  ])("%j → %s", (surcharge, raison) => {
    expect(iaPrete({ ...base, ...surcharge })).toEqual({ prete: false, raison });
  });
  it("le mode local passe avant tout le reste", () => {
    expect(iaPrete({ ...base, modeCompte: false, enLigne: false, cles: [] }).raison).toBe(
      "mode-local",
    );
  });
  it("une clé jamais testée (valide: null) compte comme présente", () => {
    expect(iaPrete({ ...base, cles: [{ fournisseur: "gemini", valide: null }] }).prete).toBe(true);
  });
});
