import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { exemple } from "../../src/core/exemple.js";
import { creerSite, etatInitial } from "../../src/core/modele.js";

const etatExemple = () => ({ ...etatInitial(), grille: exemple() });

describe("reduire", () => {
  it("ne mute pas l'état d'entrée", () => {
    const etat = etatExemple();
    const avant = structuredClone(etat);
    reduire(etat, { type: A.SITE_AJOUTER, site: creerSite({ titre: "N", url: "https://n.fr" }) });
    expect(etat).toEqual(avant);
  });
  it("SITE_AJOUTER ajoute à la fin ou à un index", () => {
    const site = creerSite({ titre: "N", url: "https://n.fr" }, () => "n");
    expect(reduire(etatExemple(), { type: A.SITE_AJOUTER, site }).grille.at(-1).id).toBe("n");
    expect(reduire(etatExemple(), { type: A.SITE_AJOUTER, site, index: 0 }).grille[0].id).toBe("n");
  });
  it("action inconnue : même référence", () => {
    const etat = etatExemple();
    expect(reduire(etat, { type: "X" })).toBe(etat);
  });
});

describe("modification et suppression", () => {
  it("SITE_MODIFIER ignore les champs non autorisés", () => {
    const etat = etatExemple();
    const id = etat.grille[0].id;
    const r = reduire(etat, {
      type: A.SITE_MODIFIER,
      id,
      changements: { titre: "Nouveau", type: "dossier", id: "pirate", creeLe: 5 },
    });
    expect(r.grille[0]).toMatchObject({ id, type: "site", titre: "Nouveau", creeLe: 0 });
    expect(reduire(etat, { type: A.SITE_MODIFIER, id, changements: { id: "x" } })).toBe(etat);
  });
  it("ELEMENT_SUPPRIMER puis ELEMENT_RESTAURER redonne exactement l'état", () => {
    const etat = etatExemple();
    const element = etat.grille[3];
    const sans = reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: element.id });
    expect(sans.grille).toHaveLength(etat.grille.length - 1);
    const avec = reduire(sans, { type: A.ELEMENT_RESTAURER, element, parentId: null, index: 3 });
    expect(avec).toEqual(etat);
  });
  it("ELEMENT_RESTAURER : index hors bornes et dossier disparu", () => {
    const etat = etatExemple();
    const site = creerSite({ titre: "N", url: "https://n.fr" }, () => "n");
    const r = reduire(etat, {
      type: A.ELEMENT_RESTAURER,
      element: site,
      parentId: "absent",
      index: 999,
    });
    expect(r.grille.at(-1).id).toBe("n");
  });
  it("suppression d'un id inconnu : même état", () => {
    const etat = etatExemple();
    expect(reduire(etat, { type: A.ELEMENT_SUPPRIMER, id: "zz" })).toBe(etat);
  });
});

describe("tags et description (V4.2)", () => {
  const base = () => ({
    ...etatInitial(),
    grille: [creerSite({ titre: "A", url: "https://a.fr" }, () => "a")],
  });
  const site = (etat) => etat.grille[0];

  it("un site neuf a des champs vides, jamais modifiés par l'IA tant que rien n'est écrit", () => {
    expect(site(base())).toMatchObject({
      tags: [],
      description: "",
      tagsManuels: false,
      ia: { etat: "aucun", majLe: null },
    });
  });

  it("SITE_MODIFIER nettoie les tags et la description, et marque le site « à la main »", () => {
    const r = reduire(base(), {
      type: A.SITE_MODIFIER,
      id: "a",
      changements: { tags: ["#Jeux", "jeux", "  Vidéo  "], description: "  Un   site.  " },
    });
    expect(site(r)).toMatchObject({
      tags: ["jeux", "vidéo"],
      description: "Un site.",
      tagsManuels: true,
    });
  });

  it("renommer ne touche pas à tagsManuels", () => {
    const r = reduire(base(), { type: A.SITE_MODIFIER, id: "a", changements: { titre: "B" } });
    expect(site(r).tagsManuels).toBe(false);
  });

  it("« Laisser l'IA gérer » : tagsManuels: false est respecté", () => {
    let r = reduire(base(), { type: A.SITE_MODIFIER, id: "a", changements: { tags: ["x"] } });
    expect(site(r).tagsManuels).toBe(true);
    r = reduire(r, { type: A.SITE_MODIFIER, id: "a", changements: { tagsManuels: false } });
    expect(site(r).tagsManuels).toBe(false);
    expect(site(r).tags).toEqual(["x"]);
  });

  it("valeurs invalides : nettoyées (12 tags → 10, texte trop long coupé)", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const r = reduire(base(), {
      type: A.SITE_MODIFIER,
      id: "a",
      changements: { tags, description: "x".repeat(500), tagsManuels: "oui" },
    });
    expect(site(r).tags).toHaveLength(10);
    expect(site(r).description).toHaveLength(300);
    expect(site(r).tagsManuels).toBe(true);
  });

  it("SITE_DEFINIR_IA remplit un site non écrit à la main", () => {
    const r = reduire(base(), {
      type: A.SITE_DEFINIR_IA,
      id: "a",
      etat: "ok",
      tags: ["Cuisine", "recettes"],
      description: "Des recettes.",
      majLe: 42,
    });
    expect(site(r)).toMatchObject({
      tags: ["cuisine", "recettes"],
      description: "Des recettes.",
      tagsManuels: false,
      ia: { etat: "ok", majLe: 42 },
    });
  });

  it("SITE_DEFINIR_IA n'écrase JAMAIS des tags écrits à la main (seul l'état est mis à jour)", () => {
    let r = reduire(base(), {
      type: A.SITE_MODIFIER,
      id: "a",
      changements: { tags: ["perso"], description: "Ma description." },
    });
    r = reduire(r, {
      type: A.SITE_DEFINIR_IA,
      id: "a",
      etat: "ok",
      tags: ["ia"],
      description: "Celle de l'IA.",
      majLe: 9,
    });
    expect(site(r)).toMatchObject({
      tags: ["perso"],
      description: "Ma description.",
      tagsManuels: true,
      ia: { etat: "ok", majLe: 9 },
    });
  });

  it("SITE_DEFINIR_IA en échec ou en attente : l'état seulement, les tags sont gardés", () => {
    let r = reduire(base(), {
      type: A.SITE_DEFINIR_IA,
      id: "a",
      etat: "ok",
      tags: ["a"],
      description: "d",
    });
    r = reduire(r, {
      type: A.SITE_DEFINIR_IA,
      id: "a",
      etat: "echec",
      erreur: "délai",
      majLe: 3,
      tags: ["pirate"],
    });
    expect(site(r)).toMatchObject({
      tags: ["a"],
      description: "d",
      ia: { etat: "echec", erreur: "délai" },
    });
  });

  it("site absent, dossier visé, état inconnu : rien ne change", () => {
    const etat = {
      ...base(),
      grille: [...base().grille, { id: "d", type: "dossier", titre: "D", items: [], creeLe: 0 }],
    };
    expect(reduire(etat, { type: A.SITE_DEFINIR_IA, id: "x", etat: "ok", tags: ["a"] })).toBe(etat);
    expect(reduire(etat, { type: A.SITE_DEFINIR_IA, id: "d", etat: "ok", tags: ["a"] })).toBe(etat);
    expect(reduire(etat, { type: A.SITE_DEFINIR_IA, id: "a", etat: "bizarre", tags: ["a"] })).toBe(
      etat,
    );
  });

  it("rejouée deux fois : même résultat (robuste au rejeu)", () => {
    const action = {
      type: A.SITE_DEFINIR_IA,
      id: "a",
      etat: "ok",
      tags: ["b", "a"],
      description: "d",
      majLe: 1,
    };
    const une = reduire(base(), action);
    expect(reduire(une, action)).toEqual(une);
  });
});
