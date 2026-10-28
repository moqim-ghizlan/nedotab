import { describe, expect, it } from "vitest";
import { avecRattrapage, iaAStocker, validerIa } from "../../src/core/ia.js";
import {
  DUREE_VERROU_MS,
  estimation,
  listeDossiers,
  sitesARattraper,
  verrouAutreAppareil,
} from "../../src/core/rattrapage.js";

const site = (id, extra = {}) => ({
  type: "site",
  id,
  titre: id,
  url: `https://${id}.fr`,
  tags: [],
  ia: { etat: "aucun" },
  ...extra,
});
const grille = [
  site("a"),
  {
    type: "dossier",
    id: "d1",
    titre: "Travail",
    items: [
      site("b"),
      {
        type: "dossier",
        id: "d2",
        titre: "Clients",
        items: [site("c", { tags: ["x"], ia: { etat: "ok" } }), site("d")],
      },
      site("e", { tagsManuels: true, tags: ["perso"] }),
    ],
  },
  site("f", { ia: { etat: "echec" } }),
  site("g", { tags: ["deja"], ia: { etat: "ok" } }),
];

describe("sitesARattraper", () => {
  it("sansTags : aucun ou échec, sans tags ; accueil d'abord puis dossiers", () => {
    expect(sitesARattraper(grille, { portee: "sansTags" })).toEqual(["a", "f", "b", "d"]);
  });
  it("tout : tous sauf tagsManuels", () => {
    expect(sitesARattraper(grille, { portee: "tout" })).toEqual(["a", "f", "g", "b", "c", "d"]);
  });
  it("dossier : le dossier et ses sous-dossiers", () => {
    expect(sitesARattraper(grille, { portee: "dossier", dossierId: "d1" })).toEqual(["b", "d"]);
    expect(sitesARattraper(grille, { portee: "dossier", dossierId: "d2" })).toEqual(["d"]);
    expect(sitesARattraper(grille, { portee: "dossier", dossierId: "inconnu" })).toEqual([]);
  });
  it("liste des dossiers dans l'ordre", () => {
    expect(listeDossiers(grille).map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});

describe("estimation et verrou", () => {
  it("quota suffisant, insuffisant, inconnu", () => {
    expect(estimation(10, 260)).toMatchObject({ traitables: 10, partiel: false });
    expect(estimation(128, 100)).toMatchObject({ traitables: 100, partiel: true });
    expect(estimation(5, null)).toMatchObject({ traitables: 5, partiel: false, quotaRestant: null });
  });
  it("verrou d'un autre appareil : actif puis expiré après 10 minutes", () => {
    const v = { appareil: "iphone", maj: 1000 };
    expect(verrouAutreAppareil(v, "pc", 1000 + DUREE_VERROU_MS - 1)).toEqual(v);
    expect(verrouAutreAppareil(v, "pc", 1000 + DUREE_VERROU_MS)).toBeNull();
    expect(verrouAutreAppareil(v, "iphone", 1001)).toBeNull();
    expect(verrouAutreAppareil(undefined, "pc", 1)).toBeNull();
  });
  it("le verrou est gardé dans reglages.ia et retiré avec null", () => {
    const ia = avecRattrapage({ actif: true }, { appareil: "pc", maj: 5 });
    expect(iaAStocker(validerIa(ia))).toEqual({
      actif: true,
      rattrapage: { appareil: "pc", maj: 5 },
    });
    expect(avecRattrapage(ia, null)).toEqual({ actif: true });
    expect(validerIa({ actif: true, rattrapage: { appareil: 3 } })).toEqual({ actif: true });
  });
});
