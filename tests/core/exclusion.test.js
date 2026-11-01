import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { trouver } from "../../src/core/arbre.js";
import { compterSitesExclus, estExclu, idsExclus } from "../../src/core/exclusion.js";
import { construireListe, construireListeDossiers, dossiersDe, sitesDe } from "../../src/core/listeCompacte.js";
import { creerDossier, creerSite, etatInitial } from "../../src/core/modele.js";
import { valider } from "../../src/core/migration.js";
import { sitesARattraper } from "../../src/core/rattrapage.js";

const site = (id, extra = {}) => ({ ...creerSite({ id, titre: id, url: `https://${id}.fr`, creeLe: 1 }), ...extra });
const dossier = (id, items, extra = {}) => ({ ...creerDossier({ id, titre: id, items, creeLe: 1 }), ...extra });
const grille = () => [
  site("a"),
  site("b", { iaExclu: true }),
  dossier("prive", [site("c"), dossier("sous", [site("d")])], { iaExclu: true }),
  dossier("ouvert", [site("e"), site("f", { iaExclu: true })]),
];

describe("exclusion de l'IA (V4.20)", () => {
  it("la liste compacte ne contient ni l'élément exclu ni le contenu d'un dossier exclu", () => {
    expect(sitesDe(grille()).map((s) => s.id)).toEqual(["a", "e"]);
    const { lignes } = construireListe(sitesDe(grille()));
    expect(lignes.join("\n")).not.toMatch(/\b(b|c|d|f)\.fr/);
    expect(dossiersDe(grille()).map((d) => d.id)).toEqual(["ouvert"]);
    expect(construireListeDossiers(dossiersDe(grille())).lignes).toEqual(["d1|ouvert|1"]);
  });

  it("le nombre de sites d'un dossier visible ne compte pas les sites exclus", () => {
    expect(dossiersDe(grille())[0].nbSites).toBe(1);
  });

  it("estExclu / idsExclus / compterSitesExclus", () => {
    const g = grille();
    expect(estExclu(g, "b")).toBe(true);
    expect(estExclu(g, "d")).toBe(true); // inside an excluded folder
    expect(estExclu(g, "e")).toBe(false);
    expect(estExclu(g, "inconnu")).toBe(false);
    expect([...idsExclus(g)].sort()).toEqual(["b", "c", "d", "f", "prive", "sous"]);
    expect(compterSitesExclus(g)).toBe(4);
  });

  it("le rattrapage de tags ignore les sites exclus", () => {
    expect(sitesARattraper(grille(), { portee: "tout" })).toEqual(["a", "e"]);
  });

  it("ELEMENT_IA_EXCLURE : marque, démarque, idempotent, inconnu sans effet", () => {
    const e0 = { ...etatInitial(), grille: [site("a"), dossier("d", [site("x")])] };
    const e1 = reduire(e0, { type: A.ELEMENT_IA_EXCLURE, id: "d", exclu: true });
    expect(trouver(e1.grille, "d").element.iaExclu).toBe(true);
    expect(reduire(e1, { type: A.ELEMENT_IA_EXCLURE, id: "d", exclu: true })).toBe(e1);
    const e2 = reduire(e1, { type: A.ELEMENT_IA_EXCLURE, id: "d", exclu: false });
    expect("iaExclu" in trouver(e2.grille, "d").element).toBe(false);
    expect(reduire(e2, { type: A.ELEMENT_IA_EXCLURE, id: "d", exclu: false })).toBe(e2);
    expect(reduire(e0, { type: A.ELEMENT_IA_EXCLURE, id: "nope", exclu: true })).toBe(e0);
    expect(trouver(e1.grille, "x").element.iaExclu).toBeUndefined(); // the folder carries the mark
  });

  it("validation idempotente : seul `true` survit, rien n'est ajouté aux autres éléments", () => {
    const brut = {
      ...etatInitial(),
      grille: [site("a", { iaExclu: false }), site("b", { iaExclu: "oui" }), site("c", { iaExclu: true }), dossier("d", [site("e")])],
    };
    const une = valider(brut, () => {}, () => {});
    expect(une.grille.map((e) => e.iaExclu)).toEqual([undefined, undefined, true, undefined]);
    expect("iaExclu" in une.grille[0]).toBe(false);
    const deux = valider(une, () => {}, () => {});
    expect(deux.grille).toEqual(une.grille);
  });
});
