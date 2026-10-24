import { describe, expect, it } from "vitest";
import { A, nettoyerTitreDossier, reduire } from "../../src/core/actions.js";
import {
  apercuDossier,
  compterSites,
  listerDossiers,
  parcourir,
  trouver,
} from "../../src/core/arbre.js";
import { creerDossier } from "../../src/core/modele.js";

const site = (id) => ({
  id,
  type: "site",
  titre: id,
  url: `https://${id}.fr`,
  icone: { type: "lettre", couleur: "#000" },
  creeLe: 0,
});
const dossier = (id, items = []) => ({ id, type: "dossier", titre: id, items, creeLe: 0 });
const etatDe = (grille) => ({ versionSchema: 1, grille, reglages: {} });
const ids = (liste) => liste.map((e) => e.id).join(",");

describe("DOSSIER_CREER", () => {
  it("dossier vide à la fin de l'accueil", () => {
    const r = reduire(etatDe([site("a")]), { type: A.DOSSIER_CREER, dossier: dossier("D") });
    expect(ids(r.grille)).toBe("a,D");
  });
  it("avec idsAInclure : éléments déplacés dans l'ordre de la grille et retirés de l'accueil", () => {
    const etat = etatDe([site("a"), site("b"), site("c"), site("d")]);
    const r = reduire(etat, {
      type: A.DOSSIER_CREER,
      dossier: dossier("D"),
      parentId: null,
      index: 1,
      idsAInclure: ["d", "b"],
    });
    expect(ids(r.grille)).toBe("a,D,c");
    expect(ids(trouver(r.grille, "D").element.items)).toBe("b,d");
  });
  it("« Créer un dossier avec ce site » : le dossier remplace le site à sa position", () => {
    const etat = etatDe([site("a"), site("b"), site("c")]);
    const r = reduire(etat, {
      type: A.DOSSIER_CREER,
      dossier: dossier("D"),
      index: 1,
      idsAInclure: ["b"],
    });
    expect(ids(r.grille)).toBe("a,D,c");
  });
  it("id déjà présent ou parent inconnu : état inchangé", () => {
    const etat = etatDe([dossier("D")]);
    expect(reduire(etat, { type: A.DOSSIER_CREER, dossier: dossier("D") })).toBe(etat);
    expect(reduire(etat, { type: A.DOSSIER_CREER, dossier: dossier("E"), parentId: "zz" })).toBe(
      etat,
    );
  });
});

describe("DOSSIER_RENOMMER", () => {
  it("vide → « Dossier », > 40 caractères tronqué", () => {
    const etat = etatDe([dossier("D")]);
    expect(reduire(etat, { type: A.DOSSIER_RENOMMER, id: "D", titre: "   " }).grille[0].titre).toBe(
      "Dossier",
    );
    const long = "x".repeat(60);
    expect(
      reduire(etat, { type: A.DOSSIER_RENOMMER, id: "D", titre: long }).grille[0].titre,
    ).toHaveLength(40);
    expect(nettoyerTitreDossier("  Travail   perso ")).toBe("Travail perso");
  });
  it("ne renomme pas un site", () => {
    const etat = etatDe([site("a")]);
    expect(reduire(etat, { type: A.DOSSIER_RENOMMER, id: "a", titre: "X" })).toBe(etat);
  });
});

describe("DOSSIER_SUPPRIMER", () => {
  const etat = () => etatDe([site("a"), dossier("D", [site("x"), site("y")]), site("b")]);
  it("avec contenu", () => {
    const r = reduire(etat(), { type: A.DOSSIER_SUPPRIMER, id: "D", mode: "avecContenu" });
    expect(ids(r.grille)).toBe("a,b");
  });
  it("en vidant dans le parent : à la place du dossier, dans l'ordre", () => {
    const r = reduire(etat(), { type: A.DOSSIER_SUPPRIMER, id: "D", mode: "viderDansParent" });
    expect(ids(r.grille)).toBe("a,x,y,b");
  });
  it("GRILLE_REMPLACER annule", () => {
    const avant = etat();
    const apres = reduire(avant, { type: A.DOSSIER_SUPPRIMER, id: "D", mode: "avecContenu" });
    expect(reduire(apres, { type: A.GRILLE_REMPLACER, grille: avant.grille })).toEqual(avant);
  });
});

describe("aperçu et compteurs", () => {
  const d = dossier("D", [
    dossier("S", [site("s1")]),
    site("a"),
    site("b"),
    dossier("T", [site("t1"), site("t2")]),
  ]);
  it("apercuDossier : les 4 premiers sites en profondeur", () => {
    expect(ids(apercuDossier(d))).toBe("s1,a,b,t1");
    expect(apercuDossier(dossier("V"))).toEqual([]);
  });
  it("compterSites tous niveaux", () => {
    expect(compterSites(d)).toBe(5);
  });
  it("listerDossiers avec niveau", () => {
    expect(listerDossiers([d]).map((x) => `${x.dossier.id}${x.niveau}`)).toEqual([
      "D1",
      "S2",
      "T2",
    ]);
  });
});

describe("propriété : opérations aléatoires sur les dossiers", () => {
  it("aucun id perdu ou dupliqué", () => {
    let graine = 7;
    const hasard = (n) => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine % n;
    };
    let etat = etatDe(Array.from({ length: 20 }, (_, i) => site(`s${i}`)));
    let attendus = new Set([...parcourir(etat.grille)].map((e) => e.id));
    let compteur = 0;
    for (let i = 0; i < 1500; i++) {
      const tous = [...parcourir(etat.grille)];
      const dossiers = tous.filter((e) => e.type === "dossier");
      const choix = hasard(5);
      if (choix === 0) {
        const id = `D${compteur++}`;
        const inclus = tous.filter(() => hasard(6) === 0).map((e) => e.id);
        const avant = etat;
        etat = reduire(etat, {
          type: A.DOSSIER_CREER,
          dossier: creerDossier({ titre: "D", id, creeLe: 0 }),
          parentId: dossiers.length && hasard(2) ? dossiers[hasard(dossiers.length)].id : null,
          index: hasard(10),
          idsAInclure: inclus,
        });
        if (etat !== avant) attendus.add(id);
      } else if (choix === 1 && dossiers.length) {
        const d = dossiers[hasard(dossiers.length)];
        const mode = hasard(2) ? "viderDansParent" : "avecContenu";
        if (mode === "avecContenu") for (const e of parcourir([d])) attendus.delete(e.id);
        else attendus.delete(d.id);
        etat = reduire(etat, { type: A.DOSSIER_SUPPRIMER, id: d.id, mode });
      } else if (tous.length) {
        const e = tous[hasard(tous.length)];
        const cible = dossiers.length && hasard(2) ? dossiers[hasard(dossiers.length)].id : null;
        etat = reduire(etat, {
          type: A.ELEMENT_DEPLACER,
          id: e.id,
          versParentId: cible,
          versIndex: hasard(8),
        });
      }
      const presents = [...parcourir(etat.grille)].map((e) => e.id);
      expect(new Set(presents).size).toBe(presents.length);
      expect(new Set(presents)).toEqual(attendus);
    }
  });
});
