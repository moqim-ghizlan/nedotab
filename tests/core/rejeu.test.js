import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { aplatir, parcourir, trouver } from "../../src/core/arbre.js";
import { PROFONDEUR_MAX } from "../../src/core/constantes.js";
import { etatInitial } from "../../src/core/modele.js";
import { appliquer, decrire, expliquer, messageIgnorees, rejouer } from "../../src/core/rejeu.js";
import { geler } from "../aides/arbreDe.js";

const site = (id, titre = id) => ({
  id,
  type: "site",
  titre,
  url: `https://${id}.fr`,
  creeLe: 0,
});
const dossier = (id, items = [], titre = id) => ({
  id,
  type: "dossier",
  titre,
  items,
  creeLe: 0,
});
const etat = (grille) => geler({ ...etatInitial(), grille });
const ids = (e) => [...parcourir(e.grille)].map((x) => x.id);
let n = 0;
const op = (action, base) => ({ idOp: `op${n++}`, action, creeLe: n, ...decrire(base, action) });

/** One device's operations, replayed on the server state like the transaction does. */
const appareil = (base, actions) => actions.map((a) => op(a, base));

const exemples = (base) => [
  { type: A.SITE_AJOUTER, site: site("nouveau"), parentId: null, index: 1 },
  { type: A.SITE_MODIFIER, id: "a", changements: { titre: "A2" } },
  { type: A.ELEMENT_SUPPRIMER, id: "b" },
  {
    type: A.ELEMENT_RESTAURER,
    element: site("r"),
    parentId: "d",
    index: 0,
  },
  { type: A.ELEMENT_DEPLACER, id: "a", versParentId: "d", versIndex: 0 },
  {
    type: A.DOSSIER_CREER,
    dossier: dossier("n"),
    parentId: null,
    index: 0,
    idsAInclure: ["a", "c"],
  },
  { type: A.DOSSIER_RENOMMER, id: "d", titre: "Travail" },
  { type: A.DOSSIER_SUPPRIMER, id: "d", mode: "viderDansParent" },
  { type: A.FUSIONNER, sourceId: "a", cibleId: "c", nouveauDossierId: "f", titre: "F" },
  { type: A.GRILLE_REMPLACER, grille: [site("z")] },
  { type: A.REGLAGES_MODIFIER, changements: { theme: "sombre" } },
  { type: A.SYNCHRO_APPLIQUER, grille: [site("y")], reglages: base.reglages },
  { type: A.GRILLE_RESTAURER, etat: { grille: [site("x")], reglages: base.reglages } },
  {
    type: A.FOND_AJOUTER,
    fond: { id: "f1", chemin: "users/u/fonds/f1", dominante: "#112233" },
    activer: true,
  },
  { type: A.FOND_SUPPRIMER, id: "f1" },
];

describe("déterminisme", () => {
  const base = etat([site("a"), site("b"), site("c"), dossier("d", [site("e")])]);
  for (const action of exemples(base)) {
    it(`${action.type} rejoué deux fois sur le même état → même résultat`, () => {
      expect(reduire(base, action)).toEqual(reduire(base, action));
    });
    it(`${action.type} rejoué sur son propre résultat → inchangé (idempotent)`, () => {
      const une = reduire(base, action);
      if (action.type === A.FUSIONNER || action.type === A.SITE_AJOUTER) {
        expect(ids(reduire(une, action)).sort()).toEqual(ids(une).sort());
      } else {
        expect(reduire(une, action)).toEqual(une);
      }
    });
  }
});

describe("robustesse au rejeu (cible introuvable)", () => {
  const base = etat([site("a"), dossier("d", [site("e")])]);
  const ignoree = (action, raison) => {
    const r = appliquer(base, action);
    expect(r.etat).toBe(base);
    expect(r).toMatchObject({ appliquee: false, raison });
  };
  it("SITE_MODIFIER d'un site supprimé : ignorée", () =>
    ignoree({ type: A.SITE_MODIFIER, id: "x", changements: { titre: "T" } }, "INTROUVABLE"));
  it("ELEMENT_SUPPRIMER déjà supprimé : rien à faire, pas signalée", () => {
    const r = appliquer(base, { type: A.ELEMENT_SUPPRIMER, id: "x" });
    expect(r).toMatchObject({ etat: base, appliquee: true });
  });
  it("ELEMENT_DEPLACER d'un élément supprimé : ignorée", () =>
    ignoree({ type: A.ELEMENT_DEPLACER, id: "x", versParentId: "d" }, "INTROUVABLE"));
  it("ELEMENT_DEPLACER vers un dossier supprimé : à la fin du parent d'origine", () => {
    const b = etat([site("a"), site("b"), dossier("d", [site("e"), site("f")])]);
    const r = appliquer(b, { type: A.ELEMENT_DEPLACER, id: "e", versParentId: "zz", versIndex: 0 });
    expect(r.appliquee).toBe(true);
    expect(trouver(r.etat.grille, "d").element.items.map((x) => x.id)).toEqual(["f", "e"]);
    const deja = appliquer(b, { type: A.ELEMENT_DEPLACER, id: "f", versParentId: "zz" });
    expect(deja).toMatchObject({ etat: b, appliquee: true });
  });
  it("DOSSIER_RENOMMER d'un dossier supprimé : ignorée", () =>
    ignoree({ type: A.DOSSIER_RENOMMER, id: "x", titre: "T" }, "INTROUVABLE"));
  it("DOSSIER_CREER : seuls les éléments encore présents sont inclus", () => {
    const r = appliquer(base, {
      type: A.DOSSIER_CREER,
      dossier: dossier("n"),
      parentId: null,
      index: 0,
      idsAInclure: ["a", "disparu"],
    });
    expect(r.appliquee).toBe(true);
    expect(trouver(r.etat.grille, "n").element.items.map((x) => x.id)).toEqual(["a"]);
  });
  it("FUSIONNER sans source ou sans cible : ignorée", () => {
    ignoree(
      { type: A.FUSIONNER, sourceId: "x", cibleId: "a", nouveauDossierId: "f" },
      "INTROUVABLE",
    );
    ignoree(
      { type: A.FUSIONNER, sourceId: "a", cibleId: "x", nouveauDossierId: "f" },
      "INTROUVABLE",
    );
  });
  it("index hors bornes : borné", () => {
    const r = appliquer(base, { type: A.SITE_AJOUTER, site: site("n"), index: 99 });
    expect(r.etat.grille.at(-1).id).toBe("n");
    const m = appliquer(base, { type: A.ELEMENT_DEPLACER, id: "a", versIndex: -5 });
    expect(m.etat).toBe(base); // already first
  });
  it("profondeur dépassée après un changement ailleurs : ignorée", () => {
    const profond = etat([
      dossier("d1", [dossier("d2", [site("s")])]),
      dossier("haut", [dossier("bas")]),
    ]);
    ignoree.call(null, { type: A.ELEMENT_DEPLACER, id: "haut", versParentId: "d2" }, "REFUSE");
    function ignoree(action, raison) {
      const r = appliquer(profond, action);
      expect(r.etat).toBe(profond);
      expect(r).toMatchObject({ appliquee: false, raison });
    }
  });
  it("une exception dans le réducteur rend l'opération ignorée, jamais bloquante", () => {
    const r = rejouer(base, [
      { idOp: "1", action: { type: A.SITE_MODIFIER, id: "a", changements: null } },
      { idOp: "2", action: { type: A.SITE_AJOUTER, site: null } },
      { idOp: "3", action: { type: A.SITE_AJOUTER, site: site("ok") } },
    ]);
    expect(ids(r.etat)).toContain("ok");
    expect(r.ignorees.map((i) => i.raison)).toContain("ERREUR");
  });
});

describe("scénarios de conflit (rejeu sur la version du serveur)", () => {
  const depart = etat([site("a", "GitHub"), site("b", "Courriel"), dossier("d", [site("c")])]);

  it("1. A ajoute un site, B renomme un autre site → les deux changements présents", () => {
    const serveurB = reduire(depart, {
      type: A.SITE_MODIFIER,
      id: "b",
      changements: { titre: "Mail" },
    });
    const { etat: e, ignorees } = rejouer(
      serveurB,
      appareil(depart, [{ type: A.SITE_AJOUTER, site: site("n") }]),
    );
    expect(ignorees).toEqual([]);
    expect(ids(e)).toContain("n");
    expect(trouver(e.grille, "b").element.titre).toBe("Mail");
  });

  it("2. A supprime un site, B le renomme → supprimé, opération de B signalée", () => {
    const serveurA = reduire(depart, { type: A.ELEMENT_SUPPRIMER, id: "a" });
    const { etat: e, ignorees } = rejouer(
      serveurA,
      appareil(depart, [{ type: A.SITE_MODIFIER, id: "a", changements: { titre: "Git" } }]),
    );
    expect(trouver(e.grille, "a")).toBeNull();
    expect(ignorees).toHaveLength(1);
    expect(expliquer(ignorees[0])).toBe("Renommer « GitHub » → ignoré, site supprimé ailleurs");
    expect(messageIgnorees(1)).toMatch(/^1 modification n'a pas pu être appliquée/);
  });

  it("3. A déplace X dans D, B supprime D → X à la fin de son parent d'origine, rien perdu", () => {
    const serveurB = reduire(depart, { type: A.ELEMENT_SUPPRIMER, id: "d" });
    const { etat: e } = rejouer(
      serveurB,
      appareil(depart, [{ type: A.ELEMENT_DEPLACER, id: "a", versParentId: "d", versIndex: 0 }]),
    );
    expect(e.grille.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("4. A et B renomment le même site → le dernier rejoué gagne, pas d'erreur", () => {
    const serveurA = reduire(depart, {
      type: A.SITE_MODIFIER,
      id: "a",
      changements: { titre: "A" },
    });
    const { etat: e, ignorees } = rejouer(
      serveurA,
      appareil(depart, [{ type: A.SITE_MODIFIER, id: "a", changements: { titre: "B" } }]),
    );
    expect(ignorees).toEqual([]);
    expect(trouver(e.grille, "a").element.titre).toBe("B");
  });

  it("5. A crée un dossier avec 3 sites, B en supprime un → dossier avec 2 sites", () => {
    const base = etat([site("a"), site("b"), site("c")]);
    const serveurB = reduire(base, { type: A.ELEMENT_SUPPRIMER, id: "b" });
    const { etat: e } = rejouer(
      serveurB,
      appareil(base, [
        {
          type: A.DOSSIER_CREER,
          dossier: dossier("n"),
          parentId: null,
          index: 0,
          idsAInclure: ["a", "b", "c"],
        },
      ]),
    );
    expect(trouver(e.grille, "n").element.items.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("6. A fait 50 opérations hors ligne, B en fait 10 → tous les effets compatibles", () => {
    const actionsA = Array.from({ length: 50 }, (_, i) => ({
      type: A.SITE_AJOUTER,
      site: site(`a${i}`),
    }));
    const actionsB = [
      ...Array.from({ length: 5 }, (_, i) => ({ type: A.SITE_AJOUTER, site: site(`b${i}`) })),
      { type: A.SITE_MODIFIER, id: "a", changements: { titre: "Renommé par B" } },
      { type: A.DOSSIER_RENOMMER, id: "d", titre: "Dossier de B" },
      { type: A.ELEMENT_DEPLACER, id: "b", versParentId: "d" },
      { type: A.ELEMENT_SUPPRIMER, id: "c" },
      { type: A.REGLAGES_MODIFIER, changements: { theme: "sombre" } },
    ];
    let serveur = rejouer(depart, appareil(depart, actionsB)).etat; // B online first
    const r = rejouer(serveur, appareil(depart, actionsA));
    serveur = r.etat;
    expect(r.ignorees).toEqual([]);
    const tous = ids(serveur);
    for (let i = 0; i < 50; i++) expect(tous).toContain(`a${i}`);
    for (let i = 0; i < 5; i++) expect(tous).toContain(`b${i}`);
    expect(trouver(serveur.grille, "a").element.titre).toBe("Renommé par B");
    expect(trouver(serveur.grille, "d").element.titre).toBe("Dossier de B");
    expect(trouver(serveur.grille, "b").parent.id).toBe("d");
    expect(tous).not.toContain("c");
    expect(serveur.reglages.theme).toBe("sombre");
  });
});

/** Same pseudo-random generator as the tree property test. */
function generateur(graine) {
  return (k) => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return Math.floor((graine / 2147483648) * k);
  };
}

/** Random operations of one device, generated from its own view of the state. */
function suite(hasard, depart, prefixe, longueur) {
  let vue = depart;
  const actions = [];
  for (let i = 0; i < longueur; i++) {
    const tous = [...parcourir(vue.grille)];
    const dossiers = tous.filter((e) => e.type === "dossier");
    const unDossier = () =>
      dossiers.length && hasard(2) ? dossiers[hasard(dossiers.length)].id : null;
    const unElement = () => tous[hasard(tous.length)]?.id ?? "x";
    const k = hasard(8);
    const action =
      k === 0
        ? {
            type: A.SITE_AJOUTER,
            site: site(`${prefixe}s${i}`),
            parentId: unDossier(),
            index: hasard(5),
          }
        : k === 1
          ? {
              type: A.DOSSIER_CREER,
              dossier: dossier(`${prefixe}d${i}`),
              parentId: unDossier(),
              index: hasard(5),
              idsAInclure: tous.filter(() => hasard(6) === 0).map((e) => e.id),
            }
          : k === 2
            ? {
                type: A.ELEMENT_DEPLACER,
                id: unElement(),
                versParentId: unDossier(),
                versIndex: hasard(6),
              }
            : k === 3
              ? { type: A.ELEMENT_SUPPRIMER, id: unElement() }
              : k === 4
                ? {
                    type: A.SITE_MODIFIER,
                    id: unElement(),
                    changements: { titre: `${prefixe}${i}` },
                  }
                : k === 5
                  ? { type: A.DOSSIER_RENOMMER, id: unDossier() ?? "x", titre: `${prefixe}${i}` }
                  : k === 6
                    ? {
                        type: A.FUSIONNER,
                        sourceId: unElement(),
                        cibleId: unElement(),
                        nouveauDossierId: `${prefixe}f${i}`,
                        titre: "F",
                      }
                    : {
                        type: A.DOSSIER_SUPPRIMER,
                        id: unDossier() ?? "x",
                        mode: hasard(2) ? "viderDansParent" : "",
                      };
    actions.push(action);
    vue = reduire(vue, action);
  }
  return actions;
}

function invariants(e) {
  const elements = aplatir(e.grille);
  const tous = elements.map((x) => x.element.id);
  expect(new Set(tous).size).toBe(tous.length);
  for (const { element, chemin } of elements) {
    if (element.type === "dossier") expect(chemin.length).toBeLessThan(PROFONDEUR_MAX);
  }
}

describe("propriété : deux appareils, deux ordres de rejeu", () => {
  for (const graine of [3, 42, 777, 2026]) {
    it(`suites aléatoires (graine ${graine}) : aucune exception, ids uniques, profondeur respectée`, () => {
      const hasard = generateur(graine);
      const depart = etat([
        site("a"),
        site("b"),
        dossier("d", [site("c"), dossier("e")]),
        site("g"),
      ]);
      for (let tour = 0; tour < 40; tour++) {
        const opsA = appareil(depart, suite(hasard, depart, "A", 15));
        const opsB = appareil(depart, suite(hasard, depart, "B", 15));
        const ab = rejouer(rejouer(depart, opsA).etat, opsB);
        const ba = rejouer(rejouer(depart, opsB).etat, opsA);
        for (const r of [ab, ba]) {
          expect(r.ignorees.filter((i) => i.raison === "ERREUR")).toEqual([]);
          invariants(r.etat);
        }
      }
    });
  }
});
