import { describe, expect, it } from "vitest";
import {
  ACTIONS_MAX,
  extraireBlocActions,
  masquerBlocActions,
  validerActions,
} from "../../src/core/outils.js";

const tables = {
  sites: { s1: "id-s1", s2: "id-s2", s3: "id-s3" },
  dossiers: { d1: "id-d1", d2: "id-d2" },
};
const v = (brut) => validerActions(brut, tables);

describe("extraireBlocActions / masquerBlocActions", () => {
  const bloc = '```actions\n[{"outil":"supprimer","element":"s1"}]\n```';
  it("retire le bloc, garde le tableau", () => {
    const r = extraireBlocActions(`Je propose ceci.\n\n${bloc}`);
    expect(r.texte).toBe("Je propose ceci.");
    expect(r.brut).toEqual([{ outil: "supprimer", element: "s1" }]);
  });
  it("pas de bloc, JSON illisible ou autre qu'un tableau : brut null", () => {
    expect(extraireBlocActions("Bonjour").brut).toBeNull();
    expect(extraireBlocActions("```actions\n[pas du json\n```").brut).toBeNull();
    expect(extraireBlocActions('```actions\n{"outil":"supprimer"}\n```').brut).toBeNull();
  });
  it("un bloc json ordinaire n'est pas un bloc d'actions", () => {
    const t = '```json\n[{"outil":"supprimer","element":"s1"}]\n```';
    expect(extraireBlocActions(t)).toEqual({ texte: t, brut: null });
  });
  it("bloc non terminé (flux) : masqué à l'écran, jamais lu", () => {
    const t = 'Voici.\n```actions\n[{"outil":"supp';
    expect(masquerBlocActions(t)).toBe("Voici.");
    expect(extraireBlocActions(t).brut).toBeNull();
  });
  it("le dernier bloc valide l'emporte", () => {
    const r = extraireBlocActions(
      '```actions\n[{"outil":"supprimer","element":"s1"}]\n```\n```actions\n[{"outil":"supprimer","element":"s2"}]\n```',
    );
    expect(r.brut).toEqual([{ outil: "supprimer", element: "s2" }]);
  });
});

describe("validerActions : références traduites en identifiants réels", () => {
  it("les six outils", () => {
    const r = v([
      { outil: "ajouter_site", url: "github.com", titre: "GitHub", dossier: "d1" },
      { outil: "creer_dossier", titre: "Voyage", parent: "accueil", sites: ["s1", "s2", "s1"] },
      { outil: "deplacer", element: "s3", vers: "nouveau:0" },
      { outil: "renommer", element: "d2", titre: "Développement" },
      { outil: "supprimer", element: "s2" },
      { outil: "modifier_tags", site: "s1", tags: ["cuisine", "recettes"], description: "Recettes" },
    ]);
    expect(r.refusees).toEqual([]);
    expect(r.actions).toEqual([
      { outil: "ajouter_site", url: "https://github.com", titre: "GitHub", dossier: "id-d1" },
      { outil: "creer_dossier", titre: "Voyage", parent: null, sites: ["id-s1", "id-s2"] },
      { outil: "deplacer", element: "id-s3", vers: { nouveau: 0 } },
      { outil: "renommer", element: "id-d2", titre: "Développement" },
      { outil: "supprimer", element: "id-s2" },
      {
        outil: "modifier_tags",
        site: "id-s1",
        tags: ["cuisine", "recettes"],
        description: "Recettes",
      },
    ]);
  });

  it("outil inconnu, action qui n'est pas un objet : refusées avec la raison", () => {
    const r = v([{ outil: "formater_disque" }, "supprimer", null, { element: "s1" }]);
    expect(r.actions).toEqual([]);
    expect(r.refusees.map((x) => x.raison)).toEqual([
      "outil inconnu",
      "action invalide",
      "action invalide",
      "outil inconnu",
    ]);
  });

  it("références inexistantes (ancienne réponse, inventées) : refusées", () => {
    const r = v([
      { outil: "supprimer", element: "s99" },
      { outil: "deplacer", element: "s1", vers: "d9" },
      { outil: "creer_dossier", titre: "A", sites: ["s1", "s42"] },
      { outil: "renommer", element: "../etc", titre: "x" },
      { outil: "supprimer", element: "constructor" },
      { outil: "supprimer", element: "__proto__" },
    ]);
    expect(r.actions).toEqual([]);
    expect(r.refusees).toHaveLength(6);
  });

  it("nouveau:i sans dossier créé avant, ou index trop grand : refusé", () => {
    const r = v([
      { outil: "deplacer", element: "s1", vers: "nouveau:0" },
      { outil: "creer_dossier", titre: "A" },
      { outil: "deplacer", element: "s2", vers: "nouveau:3" },
      { outil: "deplacer", element: "s3", vers: "nouveau:0" },
    ]);
    expect(r.actions.map((a) => a.outil)).toEqual(["creer_dossier", "deplacer"]);
    expect(r.actions[1].vers).toEqual({ nouveau: 0 });
    expect(r.refusees.map((x) => x.index)).toEqual([0, 2]);
  });

  it("un dossier créé puis refusé : les références à lui sont refusées, pas décalées", () => {
    const r = v([
      { outil: "creer_dossier", titre: "" }, // refused: nouveau:0 does not exist
      { outil: "creer_dossier", titre: "B" }, // nouveau:1 for the model, 0 for us
      { outil: "deplacer", element: "s1", vers: "nouveau:0" },
      { outil: "deplacer", element: "s2", vers: "nouveau:1" },
    ]);
    expect(r.actions.map((a) => a.vers ?? a.titre)).toEqual(["B", { nouveau: 0 }]);
    expect(r.actions[1].element).toBe("id-s2");
    expect(r.refusees.map((x) => x.index)).toEqual([0, 2]);
  });

  it("adresses refusées : javascript:, data:, vide, avec espace", () => {
    const r = v(
      ["javascript:alert(1)", "data:text/html,x", "", "exemple .com", "ftp://a.fr/x"].map((url) => ({
        outil: "ajouter_site",
        url,
      })),
    );
    expect(r.actions).toEqual([]);
    expect(r.refusees).toHaveLength(5);
  });

  it("titres et tags : trop longs ou vides refusés", () => {
    const r = v([
      { outil: "renommer", element: "s1", titre: "x".repeat(61) },
      { outil: "renommer", element: "s1", titre: "   " },
      { outil: "creer_dossier", titre: 5 },
      { outil: "modifier_tags", site: "s1", tags: ["a".repeat(31)] },
      { outil: "modifier_tags", site: "s1", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
      { outil: "modifier_tags", site: "s1" },
      { outil: "modifier_tags", site: "s1", description: "d".repeat(301) },
    ]);
    expect(r.actions).toEqual([]);
  });

  it("déplacer un dossier dans lui-même : refusé", () => {
    expect(v([{ outil: "deplacer", element: "d1", vers: "d1" }]).actions).toEqual([]);
  });

  it("25 actions : tronqué à 20, les autres refusées", () => {
    const brut = Array.from({ length: 25 }, () => ({ outil: "supprimer", element: "s1" }));
    const r = v(brut);
    expect(r.actions).toHaveLength(ACTIONS_MAX);
    expect(r.refusees).toHaveLength(5);
    expect(r.refusees[0].raison).toBe("trop d'actions");
  });

  it("pas un tableau : rien", () => {
    expect(v({ outil: "supprimer" }).actions).toEqual([]);
    expect(validerActions(undefined).actions).toEqual([]);
  });
});
