import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { migrer } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";
import { FONDS_MAX, fondEffectif, fondsAPurger } from "../../src/core/reglages.js";

const entree = (id) => ({
  id,
  chemin: `users/u/fonds/${id}.webp`,
  dominante: "#123456",
  largeur: 2560,
  hauteur: 1440,
  taille: 400000,
  ajouteLe: 1,
});
const avec = (n) => {
  let e = etatInitial();
  for (let i = 0; i < n; i++) e = reduire(e, { type: A.FOND_AJOUTER, fond: entree(`f${i}`) });
  return e;
};

describe("bibliothèque de fonds", () => {
  it("ajout et activation : fond synchronisé, dominante tirée de la bibliothèque", () => {
    const e = reduire(etatInitial(), { type: A.FOND_AJOUTER, fond: entree("a"), activer: true });
    expect(e.reglages.fond).toEqual({ type: "image", id: "a", voile: 0.25, flou: 0 });
    expect(fondEffectif(e)).toMatchObject({
      id: "a",
      dominante: "#123456",
      chemin: "users/u/fonds/a.webp",
    });
  });
  it("un 11ᵉ fond est refusé", () => {
    const e = avec(FONDS_MAX);
    expect(e.reglages.fonds).toHaveLength(10);
    expect(reduire(e, { type: A.FOND_AJOUTER, fond: entree("onze") })).toBe(e);
  });
  it("entrée invalide ou en double refusée", () => {
    const e = avec(1);
    expect(reduire(e, { type: A.FOND_AJOUTER, fond: entree("f0") })).toBe(e);
    expect(
      reduire(e, { type: A.FOND_AJOUTER, fond: { ...entree("x"), chemin: "ailleurs/x" } }),
    ).toBe(e);
  });
  it("supprimer le fond actif → fond « aucun »", () => {
    let e = reduire(etatInitial(), { type: A.FOND_AJOUTER, fond: entree("a"), activer: true });
    e = reduire(e, { type: A.FOND_SUPPRIMER, id: "a" });
    expect(e.reglages.fond).toEqual({ type: "aucun" });
    expect(e.reglages.fonds).toEqual([]);
  });
  it("supprimer un autre fond garde le fond actif", () => {
    let e = reduire(avec(2), {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "image", id: "f0" } },
    });
    e = reduire(e, { type: A.FOND_SUPPRIMER, id: "f1" });
    expect(e.reglages.fond.id).toBe("f0");
  });
  it("activer un fond absent de la bibliothèque : refusé", () => {
    const e = avec(1);
    expect(
      reduire(e, { type: A.REGLAGES_MODIFIER, changements: { fond: { type: "image", id: "zz" } } }),
    ).toBe(e);
  });
  it("fond local de l'appareil prioritaire sur le fond du compte", () => {
    let e = reduire(etatInitial(), { type: A.FOND_AJOUTER, fond: entree("a"), activer: true });
    e = {
      ...e,
      reglagesAppareil: {
        fond: { type: "image", ref: "local:x", dominante: "#000000", voile: 0, flou: 0 },
      },
    };
    expect(fondEffectif(e).ref).toBe("local:x");
  });
  it("activer un fond du compte retire le fond local", () => {
    let e = avec(1);
    e = reduire(e, {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "image", ref: "local:x", dominante: "#000000" } },
    });
    e = reduire(e, {
      type: A.REGLAGES_MODIFIER,
      changements: { fond: { type: "image", id: "f0" } },
    });
    expect(e.reglagesAppareil).toEqual({});
    expect(fondEffectif(e).id).toBe("f0");
  });
  it("purge du cache : les fonds qui ne sont plus dans la bibliothèque", () => {
    expect(fondsAPurger(["f0", "f1", "vieux"], avec(2).reglages)).toEqual(["vieux"]);
    expect(fondsAPurger(["a"], {})).toEqual(["a"]);
  });
  it("chargement : fond actif absent de la bibliothèque → « aucun », bibliothèque bornée", () => {
    const fonds = Array.from({ length: 12 }, (_, i) => entree(`g${i}`));
    const { etat } = migrer({
      versionSchema: 2,
      grille: [],
      reglages: { fond: { type: "image", id: "zz" }, fonds },
    });
    expect(etat.reglages.fond).toEqual({ type: "aucun" });
    expect(etat.reglages.fonds).toHaveLength(10);
  });
});
