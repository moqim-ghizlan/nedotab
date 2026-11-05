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

describe("questionBarre (V4.13)", () => {
  it("absente par défaut ; « sites » et « chat » sont gardés, le reste est ignoré", async () => {
    const { avecQuestionBarre, iaDe, iaAStocker, validerIa } = await import("../../src/core/ia.js");
    expect(validerIa({ actif: true })).toEqual({ actif: true });
    expect(validerIa({ actif: true, questionBarre: "chat" }).questionBarre).toBe("chat");
    expect(validerIa({ actif: true, questionBarre: "pirate" })).toEqual({ actif: true });
    expect(iaDe({ ia: { questionBarre: "sites" } }).questionBarre).toBe("sites");
    // A preference alone is stored, even with the assistant off.
    expect(iaAStocker({ actif: false, questionBarre: "chat" })).toEqual({
      actif: false,
      questionBarre: "chat",
    });
    expect(iaAStocker({ actif: false })).toBeUndefined();
    const ia = avecQuestionBarre({ actif: true }, "chat");
    expect(ia).toEqual({ actif: true, questionBarre: "chat" });
    expect(avecQuestionBarre(ia, "auto")).toEqual({ actif: true });
  });
});

describe("options du chatbot (T9)", () => {
  it("valeurs par défaut : le comportement actuel, rien n'est stocké", async () => {
    const { optionsChatbot, validerIa, iaAStocker, iaParDefaut } = await import("../../src/core/ia.js");
    expect(optionsChatbot({ actif: true })).toEqual({
      chatbot: true,
      boutonAccueil: true,
      rechercheIa: true,
      boutonNavigateur: true,
      heureMessages: true,
    });
    expect(iaAStocker(iaParDefaut())).toBeUndefined();
    // Settings saved before T9 stay valid and unchanged.
    expect(validerIa({ actif: true, questionBarre: "chat" })).toEqual({ actif: true, questionBarre: "chat" });
  });
  it("interrupteur principal désactivé : les trois emplacements sont ignorés", async () => {
    const { optionsChatbot } = await import("../../src/core/ia.js");
    expect(optionsChatbot({ actif: false })).toEqual({
      chatbot: false,
      boutonAccueil: false,
      rechercheIa: false,
      boutonNavigateur: false,
      heureMessages: true,
    });
    expect(optionsChatbot({ actif: false, sansBoutonAccueil: true }).boutonAccueil).toBe(false);
  });
  it("chaque emplacement se coupe seul ; le défaut retire le drapeau", async () => {
    const { avecOptionChatbot, optionsChatbot, validerIa } = await import("../../src/core/ia.js");
    let ia = avecOptionChatbot({ actif: true }, "rechercheIa", false);
    expect(ia).toEqual({ actif: true, sansRechercheIa: true });
    expect(optionsChatbot(ia)).toMatchObject({ boutonAccueil: true, rechercheIa: false, boutonNavigateur: true });
    expect(validerIa(ia).sansRechercheIa).toBe(true);
    ia = avecOptionChatbot(ia, "rechercheIa", true);
    expect(ia).toEqual({ actif: true });
    expect(avecOptionChatbot({ actif: true }, "inconnue", false)).toEqual({ actif: true });
    expect(validerIa({ actif: true, sansBoutonNavigateur: "oui" }).sansBoutonNavigateur).toBeUndefined();
  });
});
