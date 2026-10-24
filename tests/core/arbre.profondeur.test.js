import { describe, expect, it, vi } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import {
  aplatir,
  cheminVers,
  estDescendant,
  hauteur,
  niveauEmplacement,
  peutCreerDossierDans,
  peutPlacer,
  trouver,
} from "../../src/core/arbre.js";
import { valider } from "../../src/core/migration.js";
import { arbreDe, texteDe } from "../aides/arbreDe.js";

// Places: home (0), N1 content (1), N2 content (2), N3 content (3).
// H1, H2, H3 are folders of height 1, 2 and 3 sitting at home.
const GRILLE = arbreDe("N1[N2[N3[s3] s2] s1] H1[a] H2[b[c]] H3[d[e[f]]] X[Y[Z[]]] site");

describe("définitions", () => {
  it("hauteur", () => {
    const h = (id) => hauteur(trouver(GRILLE, id).element);
    expect([h("site"), h("H1"), h("H2"), h("H3"), h("N1")]).toEqual([0, 1, 2, 3, 3]);
    expect(hauteur(arbreDe("V[]")[0])).toBe(1);
  });
  it("niveauEmplacement", () => {
    expect([null, "N1", "N2", "N3"].map((id) => niveauEmplacement(GRILLE, id))).toEqual([
      0, 1, 2, 3,
    ]);
    expect(niveauEmplacement(GRILLE, "inconnu")).toBe(-1);
    expect(niveauEmplacement(GRILLE, "site")).toBe(-1);
  });
  it("cheminVers et estDescendant", () => {
    expect(cheminVers(GRILLE, "s3").map((d) => d.id)).toEqual(["N1", "N2", "N3"]);
    expect(cheminVers(GRILLE, "site")).toEqual([]);
    expect(cheminVers(GRILLE, "zz")).toBeNull();
    expect(estDescendant(GRILLE, "N1", "s3")).toBe(true);
    expect(estDescendant(GRILLE, "N2", "s1")).toBe(false);
  });
  it("aplatir donne chaque élément avec son chemin", () => {
    const s3 = aplatir(GRILLE).find((x) => x.element.id === "s3");
    expect(s3.chemin.map((d) => d.id)).toEqual(["N1", "N2", "N3"]);
  });
});

describe("peutPlacer (table de cas)", () => {
  const cas = [
    ["dossier hauteur 1 → accueil", "H1", null, true],
    ["dossier hauteur 1 → niveau 1", "H1", "N1", true],
    ["dossier hauteur 1 → niveau 2", "H1", "N2", true],
    ["dossier hauteur 1 → niveau 3", "H1", "N3", "PROFONDEUR"],
    ["dossier hauteur 2 → niveau 1", "H2", "N1", true],
    ["dossier hauteur 2 → niveau 2", "H2", "N2", "PROFONDEUR"],
    ["dossier hauteur 3 → accueil", "H3", null, true],
    ["dossier hauteur 3 → niveau 1", "H3", "H1", "PROFONDEUR"],
    ["dossier X → X", "X", "X", "BOUCLE"],
    ["dossier X → enfant de X", "X", "Y", "BOUCLE"],
    ["dossier X → petit-enfant de X", "X", "Z", "BOUCLE"],
    ["site → accueil", "s3", null, true],
    ["site → niveau 1", "site", "N1", true],
    ["site → niveau 2", "site", "N2", true],
    ["site → niveau 3", "site", "N3", true],
    ["id inexistant", "zz", null, "INTROUVABLE"],
    ["destination inexistante", "site", "zz", "INTROUVABLE"],
  ];
  for (const [nom, id, vers, attendu] of cas) {
    it(nom, () => {
      const r = peutPlacer(GRILLE, id, vers);
      if (attendu === true) expect(r).toEqual({ ok: true });
      else expect(r).toEqual({ ok: false, raison: attendu });
    });
  }
  it("peutCreerDossierDans", () => {
    expect([null, "N1", "N2", "N3", "zz"].map((id) => peutCreerDossierDans(GRILLE, id))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("le réducteur fait respecter les règles", () => {
  const etat = { versionSchema: 1, grille: GRILLE, reglages: {} };
  it("ELEMENT_DEPLACER refusé : état inchangé", () => {
    expect(reduire(etat, { type: A.ELEMENT_DEPLACER, id: "H2", versParentId: "N2" })).toBe(etat);
    expect(reduire(etat, { type: A.ELEMENT_DEPLACER, id: "X", versParentId: "Z" })).toBe(etat);
  });
  it("DOSSIER_CREER au niveau 3 refusé", () => {
    const d = { id: "new", type: "dossier", titre: "n", items: [], creeLe: 0 };
    expect(reduire(etat, { type: A.DOSSIER_CREER, dossier: d, parentId: "N3" })).toBe(etat);
    expect(reduire(etat, { type: A.DOSSIER_CREER, dossier: d, parentId: "N2" })).not.toBe(etat);
  });
  it("DOSSIER_CREER qui engloberait un dossier trop haut refusé", () => {
    const d = { id: "new", type: "dossier", titre: "n", items: [], creeLe: 0 };
    expect(
      reduire(etat, { type: A.DOSSIER_CREER, dossier: d, parentId: null, idsAInclure: ["H3"] }),
    ).toBe(etat);
    expect(
      reduire(etat, { type: A.DOSSIER_CREER, dossier: d, parentId: null, idsAInclure: ["H2"] }),
    ).not.toBe(etat);
  });
  it("ELEMENT_RESTAURER trop profond : remis à l'accueil", () => {
    const element = trouver(GRILLE, "H2").element;
    const sans = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: "H2" });
    const r = reduire(sans, { type: A.ELEMENT_RESTAURER, element, parentId: "N2", index: 0 });
    expect(trouver(r.grille, "H2").parent).toBeNull();
  });
});

describe("valider : données invalides corrigées sans rien supprimer", () => {
  it("dossier au-delà de la profondeur aplati", () => {
    const corriger = vi.fn();
    const brut = { versionSchema: 1, grille: arbreDe("A[B[C[D[x y[z]] w]]] e") };
    const r = valider(brut, () => {}, corriger);
    expect(texteDe(r.grille)).toBe("A[B[C[x z w]]] e");
    expect(corriger).toHaveBeenCalled();
  });
  it("ids dupliqués renommés, rien de perdu", () => {
    const brut = { versionSchema: 1, grille: arbreDe("a b[a c] c") };
    const r = valider(
      brut,
      () => {},
      () => {},
    );
    expect(texteDe(r.grille)).toBe("a b[a~2 c] c~2");
  });
});
