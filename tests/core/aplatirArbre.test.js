import { describe, expect, it } from "vitest";
import { aplatirArbre, filAriane, ouvertsPour } from "../../src/core/aplatirArbre.js";

const site = (id) => ({ id, type: "site", titre: id, url: "https://x.fr" });
const dossier = (id, titre, items = []) => ({ id, type: "dossier", titre, items });
const grille = [
  site("s0"),
  dossier("d1", "Travail", [
    dossier("d2", "Clients", [dossier("d3", "Gros", [site("s1")])]),
    dossier("d4", "Écoles"),
  ]),
  dossier("d5", "Perso"),
];
const ids = (l) => l.map((x) => x.id);

describe("aplatirArbre", () => {
  it("montre Accueil et les dossiers de premier niveau, repliés", () => {
    const l = aplatirArbre(grille);
    expect(ids(l)).toEqual([null, "d1", "d5"]);
    expect(l[1]).toMatchObject({ niveau: 1, aEnfants: true, ouvert: false });
  });

  it("déplie les dossiers ouverts", () => {
    const l = aplatirArbre(grille, { ouverts: new Set(["d1", "d2"]) });
    expect(ids(l)).toEqual([null, "d1", "d2", "d3", "d4", "d5"]);
    expect(l.find((x) => x.id === "d3").chemin).toEqual(["Travail", "Clients", "Gros"]);
  });

  it("filtre sans accent ni casse et déplie les parents", () => {
    const l = aplatirArbre(grille, { filtre: "ecoles" });
    expect(ids(l)).toEqual([null, "d1", "d4"]);
    expect(l.find((x) => x.id === "d4").correspond).toBe(true);
    expect(l.find((x) => x.id === "d1").ouvert).toBe(true);
  });

  it("désactive l'élément déplacé, ses descendants et l'emplacement actuel", () => {
    const l = aplatirArbre(grille, {
      ouverts: new Set(["d1", "d2"]),
      exclure: "d2",
      actuel: "d1",
    });
    const par = Object.fromEntries(l.map((x) => [x.id, x]));
    expect(par.d1).toMatchObject({ desactive: true, raison: "ACTUEL" });
    expect(par.d2).toMatchObject({ desactive: true, raison: "BOUCLE" });
    expect(par.d3).toMatchObject({ desactive: true, raison: "BOUCLE" });
    expect(par.d5.desactive).toBe(false);
  });

  it("refuse au-delà de 3 niveaux", () => {
    // Travail (hauteur 3) ne peut aller que dans Accueil.
    const l = aplatirArbre(grille, { exclure: "d1", actuel: null, ouverts: new Set(["d1"]) });
    const par = Object.fromEntries(l.map((x) => [x.id, x]));
    expect(par.d5).toMatchObject({ desactive: true, raison: "PROFONDEUR" });
  });
});

describe("ouvertsPour / filAriane", () => {
  it("liste les ancêtres à déplier", () => {
    expect([...ouvertsPour(grille, "d3")].sort()).toEqual(["d1", "d2", "d3"]);
    expect(ouvertsPour(grille, null).size).toBe(0);
  });
  it("construit le fil d'Ariane", () => {
    expect(filAriane(grille, "d2").map((e) => e.titre)).toEqual(["Accueil", "Travail", "Clients"]);
    expect(filAriane(grille, null)).toEqual([{ id: null, titre: "Accueil" }]);
  });
});
