import { describe, expect, it } from "vitest";
import { reduire } from "../../src/core/actions.js";
import {
  avecActif,
  avecModelePerso,
  avecRecommandations,
  avecUsage,
  iaAStocker,
  iaParDefaut,
  iaPrete,
  MODELES_PERSO_MAX,
  sansModelePerso,
  usagesDuModele,
  validerIa,
  validerModelePerso,
} from "../../src/core/ia.js";
import { etatInitial } from "../../src/core/modele.js";
import { validerReglages } from "../../src/core/reglages.js";

const modele = (id = "gemini-x", fournisseur = "gemini", nom = "Mon modèle") => ({
  fournisseur,
  id,
  nom,
  ajouteLe: 5,
});

describe("validation des modèles personnalisés", () => {
  it.each([
    ["gemini-3.1-flash-lite"],
    ["gpt-4o:2024-08@v1"],
    ["models/exemple_1.0"],
    ["a"],
    ["x".repeat(100)],
  ])("identifiant valide : %s", (id) => {
    expect(validerModelePerso(modele(id))).not.toBeNull();
  });

  it.each([[""], ["x".repeat(101)], ["avec espace"], ["accentué-é"], ["<script>"], ["a;b"]])(
    "identifiant invalide : %s",
    (id) => {
      expect(validerModelePerso(modele(id))).toBeNull();
    },
  );

  it("fournisseur inconnu, nom vide ou trop long : refusés", () => {
    expect(validerModelePerso(modele("m", "inconnu"))).toBeNull();
    expect(validerModelePerso(modele("m", "gemini", ""))).toBeNull();
    expect(validerModelePerso(modele("m", "gemini", "   "))).toBeNull();
    expect(validerModelePerso(modele("m", "gemini", "n".repeat(41)))).toBeNull();
    expect(validerModelePerso(modele("m", "gemini", "n".repeat(40)))).not.toBeNull();
  });

  it("maximum 20 modèles, sans doublon", () => {
    let ia = iaParDefaut();
    for (let i = 0; i < MODELES_PERSO_MAX + 5; i++) ia = avecModelePerso(ia, modele(`m${i}`));
    expect(ia.modelesPerso).toHaveLength(MODELES_PERSO_MAX);
    expect(avecModelePerso(ia, modele("m0"))).toBe(ia);
    const brut = { modelesPerso: [modele("a"), modele("a"), modele("b"), { id: 1 }] };
    expect(validerIa(brut).modelesPerso.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("suppression d'un modèle utilisé", () => {
  it("l'usage repasse à « non défini », les autres ne bougent pas", () => {
    let ia = avecModelePerso(iaParDefaut(), modele("perso"));
    ia = avecUsage(ia, "tags", { fournisseur: "gemini", modele: "perso" });
    ia = avecUsage(ia, "chat", { fournisseur: "gemini", modele: "perso" });
    ia = avecUsage(ia, "recherche", { fournisseur: "openai", modele: "autre" });
    expect(usagesDuModele(ia, "gemini", "perso")).toEqual(["tags", "chat"]);
    const apres = sansModelePerso(ia, "gemini", "perso");
    expect(apres.modelesPerso).toEqual([]);
    expect(apres.usages).toEqual({
      tags: null,
      recherche: { fournisseur: "openai", modele: "autre" },
      chat: null,
    });
  });
  it("modèle inconnu : rien ne change", () => {
    const ia = iaParDefaut();
    expect(sansModelePerso(ia, "gemini", "absent")).toBe(ia);
  });
});

describe("réglages", () => {
  it("usage inconnu ou choix invalide : refusés", () => {
    const ia = iaParDefaut();
    expect(avecUsage(ia, "autre", null)).toBe(ia);
    expect(avecUsage(ia, "tags", { fournisseur: "inconnu", modele: "m" })).toBe(ia);
    expect(avecUsage(ia, "tags", { fournisseur: "gemini", modele: "mauvais id" })).toBe(ia);
  });

  it("par défaut : désactivé, rien n'est stocké", () => {
    expect(iaParDefaut().actif).toBe(false);
    expect(iaAStocker(iaParDefaut())).toBeUndefined();
    expect(validerReglages({}).ia).toBeUndefined();
  });

  it("recommandations en un clic : seulement les fournisseurs dont on a la clé", () => {
    const suggeres = [
      { fournisseur: "openai", id: "gpt-a", recommandePour: "tags" },
      { fournisseur: "gemini", id: "gem-b", recommandePour: "tags" },
      { fournisseur: "gemini", id: "gem-c", recommandePour: "chat" },
      { fournisseur: "openai", id: "gpt-d", recommandePour: "recherche" },
    ];
    const ia = avecRecommandations(iaParDefaut(), suggeres, ["gemini"]);
    expect(ia.usages).toEqual({
      tags: { fournisseur: "gemini", modele: "gem-b" },
      recherche: null,
      chat: { fournisseur: "gemini", modele: "gem-c" },
    });
  });

  it("changement par l'action REGLAGES_MODIFIER : validé, synchronisé, sans clé", () => {
    let etat = etatInitial();
    const ia = avecUsage(avecActif(avecModelePerso(iaParDefaut(), modele("perso")), true), "tags", {
      fournisseur: "gemini",
      modele: "perso",
    });
    etat = reduire(etat, { type: "REGLAGES_MODIFIER", changements: { ia } });
    expect(etat.reglages.ia.actif).toBe(true);
    expect(etat.reglages.ia.usages.tags).toEqual({ fournisseur: "gemini", modele: "perso" });
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
    const r = validerReglages({ ia: { actif: "oui", usages: { tags: { fournisseur: 3 } } } });
    expect(r.ia).toBeUndefined();
  });
});

describe("iaPrete : tous les cas", () => {
  const cles = [{ fournisseur: "gemini", valide: true }];
  const ia = avecUsage(avecActif(iaParDefaut(), true), "tags", {
    fournisseur: "gemini",
    modele: "m",
  });
  const base = { ia, usage: "tags", modeCompte: true, enLigne: true, cles };

  it("prête", () => {
    expect(iaPrete(base)).toEqual({ prete: true });
  });
  it.each([
    [{ modeCompte: false }, "mode-local"],
    [{ ia: avecActif(ia, false) }, "desactivee"],
    [{ usage: "chat" }, "pas-de-modele"],
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
