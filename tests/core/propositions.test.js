import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { trouver } from "../../src/core/arbre.js";
import { creerDossier, creerSite, etatInitial } from "../../src/core/modele.js";
import { convertir, RAISONS, resume, simuler, statutApres } from "../../src/core/propositions.js";
import { rejouer } from "../../src/core/rejeu.js";

const site = (id, titre) => creerSite({ id, titre, url: `https://${id}.fr`, creeLe: 1 });
const dossier = (id, titre, items = []) => creerDossier({ id, titre, items, creeLe: 1 });
const etat = (grille) => ({ ...etatInitial(), grille });
const generateur = () => {
  let n = 0;
  return () => `gen-${++n}`;
};
const conv = (actions, e) => convertir({ actions }, e, { genererId: generateur(), maintenant: 5 });

describe("convertir", () => {
  const e = etat([site("a", "Booking"), site("b", "Skyscanner"), dossier("d", "Archives", [site("v", "Vieux")])]);

  it("les six outils deviennent des actions du store, avec des identifiants générés d'avance", () => {
    const items = conv(
      [
        { outil: "creer_dossier", titre: "Voyage", parent: null, sites: ["a", "b"] },
        { outil: "ajouter_site", url: "https://github.com", titre: "GitHub", dossier: { nouveau: 0 } },
        { outil: "deplacer", element: "v", vers: { nouveau: 0 } },
        { outil: "renommer", element: "d", titre: "Anciens" },
        { outil: "renommer", element: "a", titre: "Booking.com" },
        { outil: "supprimer", element: "d" },
        { outil: "modifier_tags", site: "a", tags: ["voyage"], description: "Hôtels" },
      ],
      e,
    );
    expect(items.map((i) => i.action.type)).toEqual([
      A.DOSSIER_CREER,
      A.SITE_AJOUTER,
      A.ELEMENT_DEPLACER,
      A.DOSSIER_RENOMMER,
      A.SITE_MODIFIER,
      A.ELEMENT_SUPPRIMER,
      A.SITE_MODIFIER,
    ]);
    expect(items[0].action).toMatchObject({
      parentId: null,
      idsAInclure: ["a", "b"],
      dossier: { id: "gen-1", titre: "Voyage" },
    });
    expect(items[1].action).toMatchObject({ parentId: "gen-1", site: { id: "gen-2", creeLe: 5 } });
    expect(items[2].action).toMatchObject({ id: "v", versParentId: "gen-1" });
    expect(items[0].libelle).toBe("Créer le dossier « Voyage » avec 2 sites");
    expect(items[2].libelle).toBe("Déplacer « Vieux » vers « Voyage »");
    expect(items[5].libelle).toBe("Supprimer le dossier « Archives » (1 site dedans)");
  });

  it("seules les suppressions sont marquées destructives", () => {
    const items = conv(
      [
        { outil: "supprimer", element: "a" },
        { outil: "deplacer", element: "b", vers: null },
      ],
      e,
    );
    expect(items.map((i) => i.destructif)).toEqual([true, false]);
  });

  it("déterminisme : deux conversions avec le même générateur donnent les mêmes actions", () => {
    const actions = [
      { outil: "creer_dossier", titre: "Voyage", sites: ["a"] },
      { outil: "ajouter_site", url: "https://x.fr", dossier: { nouveau: 0 } },
    ];
    expect(conv(actions, e)).toEqual(conv(actions, e));
  });

  it("titre de dossier nettoyé comme dans l'interface (40 caractères)", () => {
    const [i] = conv([{ outil: "creer_dossier", titre: "x".repeat(60) }], e);
    expect(i.action.dossier.titre).toHaveLength(40);
  });
});

describe("simuler", () => {
  const e = etat([site("a", "Booking"), site("b", "Skyscanner"), site("c", "Autre")]);

  it("dossier créé puis site déplacé dedans, avec le même réducteur que l'interface", () => {
    const items = conv(
      [
        { outil: "creer_dossier", titre: "Voyage", sites: ["a"] },
        { outil: "deplacer", element: "b", vers: { nouveau: 0 } },
      ],
      e,
    );
    const { etatFinal, resultats } = simuler(e, items);
    expect(resultats.map((r) => r.ok)).toEqual([true, true]);
    const voyage = trouver(etatFinal.grille, "gen-1").element;
    expect(voyage.items.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(etatFinal.grille.map((x) => x.id)).toContain("c");
    expect(e.grille).toHaveLength(3); // the state given is untouched
  });

  it("déplacement qui dépasserait 3 niveaux : refusé, exclu, le reste s'applique", () => {
    const profond = etat([
      dossier("n1", "N1", [dossier("n2", "N2", [dossier("n3", "N3")])]),
      dossier("autre", "Autre", [site("s", "S")]),
      site("a", "A"),
    ]);
    const items = conv(
      [
        { outil: "deplacer", element: "autre", vers: "n3" },
        { outil: "creer_dossier", titre: "Trop profond", parent: "n3" },
        { outil: "deplacer", element: "a", vers: "n3" },
      ],
      profond,
    );
    const { etatFinal, resultats } = simuler(profond, items);
    expect(resultats.map((r) => r.raison ?? "ok")).toEqual([
      RAISONS.PROFONDEUR,
      RAISONS.PROFONDEUR,
      "ok",
    ]);
    expect(trouver(etatFinal.grille, "a").parent.id).toBe("n3");
    expect(trouver(etatFinal.grille, "autre").parent).toBeNull();
  });

  it("dossier déplacé dans lui-même ou dans un descendant : refusé", () => {
    const e2 = etat([dossier("p", "P", [dossier("f", "F")])]);
    const items = conv(
      [
        { outil: "deplacer", element: "p", vers: "f" },
        { outil: "deplacer", element: "p", vers: "p" },
      ],
      e2,
    );
    const { resultats, etatFinal } = simuler(e2, items);
    expect(resultats.map((r) => r.raison)).toEqual([RAISONS.BOUCLE, RAISONS.BOUCLE]);
    expect(etatFinal).toBe(e2);
  });

  it("suppression d'un élément déjà supprimé, cible disparue : exclues avec la raison", () => {
    const items = conv(
      [
        { outil: "supprimer", element: "a" },
        { outil: "supprimer", element: "a" }, // twice
        { outil: "deplacer", element: "b", vers: "disparu" },
        { outil: "renommer", element: "a", titre: "Plus là" },
      ],
      e,
    );
    const { resultats } = simuler(e, items);
    expect(resultats.map((r) => r.ok)).toEqual([true, false, false, false]);
    expect(resultats[1].raison).toBe(RAISONS.INTROUVABLE);
    expect(resultats[2].raison).toBe(RAISONS.CIBLE);
  });

  it("l'état a changé depuis la proposition : la cible d'un déplacement n'existe plus", () => {
    const items = conv(
      [{ outil: "deplacer", element: "a", vers: "d" }],
      etat([site("a", "A"), dossier("d", "D")]),
    );
    const apres = etat([site("a", "A")]); // d deleted on another device
    expect(simuler(apres, items).resultats[0]).toMatchObject({ ok: false, raison: RAISONS.CIBLE });
  });

  it("renommer pareil : « déjà à jour », pas une application", () => {
    const items = conv([{ outil: "renommer", element: "a", titre: "Booking" }], e);
    expect(simuler(e, items).resultats[0]).toMatchObject({ ok: false, raison: RAISONS.AUCUN_CHANGEMENT });
  });

  it("application partielle : seuls les éléments cochés sont appliqués", () => {
    const items = conv(
      [
        { outil: "renommer", element: "a", titre: "A2" },
        { outil: "supprimer", element: "b" },
        { outil: "renommer", element: "c", titre: "C2" },
      ],
      e,
    );
    const { etatFinal, resultats } = simuler(e, items, new Set([0, 2]));
    expect(resultats.map((r) => (r.ignore ? "ignoré" : r.ok ? "ok" : "refusé"))).toEqual([
      "ok",
      "ignoré",
      "ok",
    ]);
    expect(etatFinal.grille.map((s) => s.titre)).toEqual(["A2", "Skyscanner", "C2"]);
    expect(statutApres(resultats)).toBe("partielle");
    expect(statutApres(simuler(e, items.slice(0, 1)).resultats)).toBe("appliquee");
  });

  it("une action qui dépend d'un dossier non coché est refusée, pas appliquée ailleurs", () => {
    const items = conv(
      [
        { outil: "creer_dossier", titre: "Voyage" },
        { outil: "deplacer", element: "a", vers: { nouveau: 0 } },
      ],
      e,
    );
    const { etatFinal, resultats } = simuler(e, items, new Set([1]));
    expect(resultats[1]).toMatchObject({ ok: false, raison: RAISONS.CIBLE });
    expect(etatFinal).toBe(e);
  });

  it("annuler : remettre la grille d'avant donne un état strictement identique", () => {
    const items = conv(
      [
        { outil: "creer_dossier", titre: "Voyage", sites: ["a", "b"] },
        { outil: "supprimer", element: "c" },
      ],
      e,
    );
    const { etatFinal } = simuler(e, items);
    expect(etatFinal.grille).not.toEqual(e.grille);
    const annule = reduire(etatFinal, { type: A.GRILLE_REMPLACER, grille: e.grille });
    expect(annule.grille).toEqual(e.grille);
  });

  it("rejeu (V2.9) : les actions issues d'une proposition rejouées deux fois ne changent plus rien", () => {
    const items = conv(
      [
        { outil: "creer_dossier", titre: "Voyage", sites: ["a"] },
        { outil: "renommer", element: "b", titre: "B2" },
      ],
      e,
    );
    const { etatFinal } = simuler(e, items);
    const actions = items.map((i) => i.action);
    const rejoue = rejouer(etatFinal, actions);
    expect(rejoue.etat.grille).toEqual(etatFinal.grille);
  });
});

describe("resume", () => {
  it("compte les actions applicables par outil", () => {
    const e = etat([site("a", "A"), site("b", "B"), site("c", "C")]);
    const items = conv(
      [
        { outil: "creer_dossier", titre: "V", sites: ["a"] },
        { outil: "deplacer", element: "b", vers: { nouveau: 0 } },
        { outil: "deplacer", element: "c", vers: { nouveau: 0 } },
        { outil: "supprimer", element: "inconnu" },
      ],
      e,
    );
    expect(resume(simuler(e, items).resultats)).toBe("Créer 1 dossier · Déplacer 2 éléments");
    expect(resume([])).toBe("");
  });
});
