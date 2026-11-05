import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { changerIconeDossier } from "../../src/core/arbre.js";
import { validerIconeDossier } from "../../src/core/iconeDossier.js";
import { creerDossier, creerSite, etatInitial } from "../../src/core/modele.js";
import { valider } from "../../src/core/migration.js";

const site = (id) => creerSite({ id, titre: id, url: `https://${id}.fr` });
const grille = () => [
  creerDossier({ id: "D", titre: "D", items: [site("a"), creerDossier({ id: "S", titre: "S", items: [site("b")] })] }),
  site("z"),
];
const glyphe = { type: "glyphe", id: "musique", couleur: "#336699" };

describe("changerIconeDossier", () => {
  it("ajoute, remplace et retire sans toucher au reste", () => {
    const g = grille();
    const avec = changerIconeDossier(g, "D", glyphe);
    expect(avec[0].icone).toEqual(glyphe);
    expect(avec[0].items).toBe(g[0].items);
    expect(avec[1]).toBe(g[1]);
    const autre = changerIconeDossier(avec, "S", { type: "lettre", couleur: "#112233", texte: "S" });
    expect(autre[0].items[1].icone.type).toBe("lettre");
    expect(autre[0].icone).toEqual(glyphe);
    const sans = changerIconeDossier(avec, "D", null);
    expect("icone" in sans[0]).toBe(false);
    expect(g[0]).not.toHaveProperty("icone");
  });
  it("refuse une icône invalide ou une image trop lourde", () => {
    const g = grille();
    expect(changerIconeDossier(g, "D", { type: "glyphe", id: "inconnu", couleur: "#fff" })).toBe(g);
    expect(changerIconeDossier(g, "D", { type: "image", valeur: "data:image/png;base64," + "A".repeat(30000) })).toBe(g);
    expect(changerIconeDossier(g, "D", { type: "url", valeur: "javascript:alert(1)", source: "perso" })).toBe(g);
  });
  it("ne s'applique pas à un site", () => {
    const g = grille();
    expect(changerIconeDossier(g, "z", glyphe)[1]).toBe(g[1]);
  });
  it("action du réducteur", () => {
    const e = { ...etatInitial(), grille: grille() };
    const r = reduire(e, { type: A.DOSSIER_ICONE, id: "D", icone: glyphe });
    expect(r.grille[0].icone).toEqual(glyphe);
  });
  it("validerIconeDossier : lettre et url valides", () => {
    expect(validerIconeDossier({ type: "lettre", couleur: "#abc", texte: "abcd" })).toEqual({ type: "lettre", couleur: "#abc", texte: "ab" });
    expect(validerIconeDossier({ type: "url", valeur: "https://x.fr/i.png", source: "x" })).toEqual({ type: "url", valeur: "https://x.fr/i.png", source: "perso" });
    expect(validerIconeDossier(null)).toBeNull();
  });
  it("migration : ancien dossier sans icône inchangé, icône invalide retirée", () => {
    const g = grille();
    g[0].icone = { type: "glyphe", id: "nope", couleur: "#fff" };
    const e = valider({ ...etatInitial(), grille: g }, () => {}, () => {});
    expect("icone" in e.grille[0]).toBe(false);
    const ok = valider({ ...etatInitial(), grille: changerIconeDossier(grille(), "D", glyphe) });
    expect(ok.grille[0].icone).toEqual(glyphe);
  });
});
