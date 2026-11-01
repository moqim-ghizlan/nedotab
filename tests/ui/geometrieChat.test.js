import { describe, expect, it } from "vitest";
import {
  geometrieFeuille,
  SEUIL_DEFILEMENT_PX,
  visibiliteRobot,
} from "../../src/ui/chat/geometrie.js";

describe("geometrieFeuille (clavier iOS)", () => {
  it("sans clavier : la feuille prend toute la fenêtre", () => {
    expect(geometrieFeuille({ hauteurVisible: 800, decalageHaut: 0, hauteurFenetre: 800 })).toEqual({
      hauteur: 800,
      decalage: 0,
    });
  });
  it("clavier ouvert : la feuille se réduit à la zone visible", () => {
    expect(geometrieFeuille({ hauteurVisible: 480, decalageHaut: 0, hauteurFenetre: 800 }).hauteur).toBe(480);
  });
  it("iOS a fait défiler la zone visible : la feuille la suit sans dépasser la place laissée", () => {
    expect(geometrieFeuille({ hauteurVisible: 480, decalageHaut: 120, hauteurFenetre: 800 }).decalage).toBe(120);
    expect(geometrieFeuille({ hauteurVisible: 480, decalageHaut: 900, hauteurFenetre: 800 }).decalage).toBe(320);
    expect(geometrieFeuille({ hauteurVisible: 480, decalageHaut: -30, hauteurFenetre: 800 }).decalage).toBe(0);
  });
  it("valeurs absentes ou absurdes : repli sur la fenêtre, hauteur minimale", () => {
    expect(geometrieFeuille({ hauteurVisible: undefined, hauteurFenetre: 700 }).hauteur).toBe(700);
    expect(geometrieFeuille({ hauteurVisible: 10, hauteurFenetre: 700 }).hauteur).toBe(120);
    expect(geometrieFeuille({ hauteurVisible: NaN, decalageHaut: NaN, hauteurFenetre: 700 })).toEqual({
      hauteur: 700,
      decalage: 0,
    });
  });
  it("barre d'outils du clavier iPad : la hauteur visible fait foi", () => {
    expect(geometrieFeuille({ hauteurVisible: 640, decalageHaut: 0, hauteurFenetre: 1024 }).hauteur).toBe(640);
  });
});

describe("visibiliteRobot (défilement)", () => {
  it("vers le bas au-delà du seuil : caché", () => {
    expect(visibiliteRobot({ cache: false, repere: 0, y: SEUIL_DEFILEMENT_PX + 1 })).toEqual({
      cache: true,
      repere: SEUIL_DEFILEMENT_PX + 1,
    });
  });
  it("petit mouvement vers le bas : inchangé", () => {
    expect(visibiliteRobot({ cache: false, repere: 100, y: 110 })).toEqual({ cache: false, repere: 100 });
  });
  it("vers le haut : réapparaît", () => {
    expect(visibiliteRobot({ cache: true, repere: 300, y: 250 })).toEqual({ cache: false, repere: 250 });
  });
  it("tout en haut de la page : toujours visible", () => {
    expect(visibiliteRobot({ cache: true, repere: 300, y: 0 })).toEqual({ cache: false, repere: 0 });
  });
});
