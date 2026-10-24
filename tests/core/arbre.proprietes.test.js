import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { aplatir, parcourir, trouver } from "../../src/core/arbre.js";
import { PROFONDEUR_MAX } from "../../src/core/constantes.js";
import { geler } from "../aides/arbreDe.js";

/**
 * Property test: 2 000 random operations (add a site, create a folder, move, rename,
 * delete, restore, delete a folder, undo). After each one: no duplicated id, no folder at
 * level 3 or deeper, nothing lost except what was deleted, input never mutated.
 * Every grid operation added later must be added here.
 */
function generateur(graine) {
  return (n) => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return Math.floor((graine / 2147483648) * n);
  };
}

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });

function verifierInvariants(etat, attendus) {
  const elements = aplatir(etat.grille);
  const ids = elements.map((x) => x.element.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const { element, chemin } of elements) {
    if (element.type === "dossier") expect(chemin.length).toBeLessThan(PROFONDEUR_MAX);
  }
  expect(new Set(ids)).toEqual(attendus);
}

describe("propriétés de l'arbre", () => {
  for (const graine of [1, 2024, 99]) {
    it(`2 000 opérations aléatoires (graine ${graine})`, () => {
      const hasard = generateur(graine);
      let etat = geler({ versionSchema: 1, grille: [site("s0"), site("s1")], reglages: {} });
      const attendus = new Set(["s0", "s1"]);
      const corbeille = []; // deleted elements that may be restored
      let n = 2;
      for (let i = 0; i < 2000; i++) {
        const tous = [...parcourir(etat.grille)];
        const dossiers = tous.filter((e) => e.type === "dossier");
        const unDossier = () =>
          dossiers.length && hasard(3) ? dossiers[hasard(dossiers.length)].id : null;
        const avant = etat;
        const op = hasard(9);
        let action;
        if (op === 0) {
          action = {
            type: A.SITE_AJOUTER,
            site: site(`s${n++}`),
            parentId: unDossier(),
            index: hasard(6),
          };
        } else if (op === 1) {
          const inclus = tous.filter(() => hasard(8) === 0).map((e) => e.id);
          action = {
            type: A.DOSSIER_CREER,
            dossier: { id: `d${n++}`, type: "dossier", titre: "D", items: [], creeLe: 0 },
            parentId: unDossier(),
            index: hasard(6),
            idsAInclure: inclus,
          };
        } else if (op <= 3 && tous.length) {
          action = {
            type: A.ELEMENT_DEPLACER,
            id: tous[hasard(tous.length)].id,
            versParentId: unDossier(),
            versIndex: hasard(8),
          };
        } else if (op === 4 && dossiers.length) {
          action = {
            type: A.DOSSIER_RENOMMER,
            id: dossiers[hasard(dossiers.length)].id,
            titre: `T${i}`,
          };
        } else if (op === 5 && tous.length) {
          const r = trouver(etat.grille, tous[hasard(tous.length)].id);
          corbeille.push({ element: r.element, parentId: r.parent?.id ?? null, index: r.index });
          action = { type: A.ELEMENT_SUPPRIMER, id: r.element.id };
        } else if (op === 6 && corbeille.length) {
          action = {
            type: A.ELEMENT_RESTAURER,
            ...corbeille.splice(hasard(corbeille.length), 1)[0],
          };
        } else if (op === 7 && dossiers.length) {
          const d = dossiers[hasard(dossiers.length)];
          const mode = hasard(2) ? "viderDansParent" : "avecContenu";
          if (mode === "avecContenu") corbeille.push({ element: d, parentId: null, index: 0 });
          action = { type: A.DOSSIER_SUPPRIMER, id: d.id, mode };
        } else {
          continue;
        }
        etat = geler(reduire(avant, action));
        // Track what must be present.
        if (etat !== avant) {
          attendus.clear();
          for (const e of parcourir(etat.grille)) attendus.add(e.id);
          const presentsAvant = new Set([...parcourir(avant.grille)].map((e) => e.id));
          const disparus = [...presentsAvant].filter((id) => !attendus.has(id));
          if (
            action.type === A.ELEMENT_SUPPRIMER ||
            (action.type === A.DOSSIER_SUPPRIMER && action.mode === "avecContenu")
          ) {
            const retire = trouver(avant.grille, action.id).element;
            const permis = new Set([...parcourir([retire])].map((e) => e.id));
            expect(disparus.every((id) => permis.has(id))).toBe(true);
          } else if (action.type === A.DOSSIER_SUPPRIMER) {
            expect(disparus).toEqual([action.id]);
          } else {
            expect(disparus).toEqual([]);
          }
        }
        verifierInvariants(etat, attendus);
      }
    });
  }
});
