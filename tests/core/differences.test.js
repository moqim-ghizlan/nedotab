import { describe, expect, it } from "vitest";
import { comparer, resumer } from "../../src/core/differences.js";
import { arbreDe } from "../aides/arbreDe.js";

const ids = (l) =>
  l
    .map((x) => (x.element ?? x).id)
    .sort()
    .join(",");

describe("différences entre deux grilles", () => {
  it("grilles identiques", () => {
    const d = comparer(arbreDe("a b D[c]"), arbreDe("a b D[c]"));
    expect(d).toEqual({ ajoutes: [], retires: [], deplaces: [], renommes: [] });
    expect(resumer(d)).toBe("Aucune différence");
  });
  it("ajout (présent dans la sauvegarde seulement)", () => {
    expect(ids(comparer(arbreDe("a"), arbreDe("a b")).ajoutes)).toBe("b");
  });
  it("retrait (présent maintenant seulement)", () => {
    expect(ids(comparer(arbreDe("a b"), arbreDe("a")).retires)).toBe("b");
  });
  it("déplacement vers un dossier", () => {
    const d = comparer(arbreDe("a D[]"), arbreDe("D[a]"));
    expect(ids(d.deplaces)).toBe("a");
    expect(d.deplaces[0].vers.map((x) => x.id)).toEqual(["D"]);
  });
  it("renommage", () => {
    const actuelle = arbreDe("a");
    const cible = [{ ...actuelle[0], titre: "Nouveau" }];
    expect(comparer(actuelle, cible).renommes[0]).toMatchObject({
      ancien: "a",
      nouveau: "Nouveau",
    });
  });
  it("tout à la fois, sur 3 niveaux", () => {
    const actuelle = arbreDe("a b T[C[P[x y]] z]");
    const cible = arbreDe("a n T[C[P[x] y]] q[]");
    const d = comparer(actuelle, cible);
    expect(ids(d.ajoutes)).toBe("n,q");
    expect(ids(d.retires)).toBe("b,z");
    expect(ids(d.deplaces)).toBe("y");
    expect(resumer(d)).toBe("+1 site, −2 sites, 1 déplacé");
  });
});
