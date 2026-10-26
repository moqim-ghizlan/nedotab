import { describe, expect, it, vi } from "vitest";
import {
  capacitesEntree,
  menuPourPointeur,
  suivreEntrees,
  toucheDeClavierPhysique,
} from "../../src/ui/entrees.js";

/** matchMedia simulé : { "(hover: hover)": bool, … } et un moyen de déclencher « change ». */
function faussesMedias(valeurs) {
  const ecouteurs = {};
  const mm = (requete) => ({
    get matches() {
      return !!valeurs[requete];
    },
    addEventListener: (_t, f) => (ecouteurs[requete] ??= []).push(f),
  });
  const changer = (requete, valeur) => {
    valeurs[requete] = valeur;
    for (const f of ecouteurs[requete] ?? []) f();
  };
  return { mm, changer };
}

describe("capacitesEntree", () => {
  it("tablette nue : ni pointeur ni clavier", () => {
    expect(capacitesEntree({ survol: false, pointeurFin: false, clavierVu: false })).toEqual({
      pointeur: false,
      clavier: false,
    });
  });
  it("trackpad : pointeur, donc clavier probable", () => {
    expect(capacitesEntree({ survol: true, pointeurFin: true, clavierVu: false })).toEqual({
      pointeur: true,
      clavier: true,
    });
  });
  it("clavier vu sans trackpad", () => {
    expect(capacitesEntree({ survol: false, pointeurFin: false, clavierVu: true })).toEqual({
      pointeur: false,
      clavier: true,
    });
  });
});

describe("menuPourPointeur", () => {
  it.each([
    ["touch", "tactile"],
    ["pen", "tactile"],
    ["mouse", "souris"],
  ])("%s → menu %s", (type, attendu) => {
    expect(menuPourPointeur(type)).toBe(attendu);
  });
  it("sans pointeur (clavier, VoiceOver) : selon le survol de l'écran", () => {
    expect(menuPourPointeur("", { sansSurvol: true })).toBe("tactile");
    expect(menuPourPointeur("", { sansSurvol: false })).toBe("souris");
  });
});

describe("toucheDeClavierPhysique", () => {
  it("raccourci avec modificateur, Tab, flèches : oui", () => {
    expect(toucheDeClavierPhysique({ key: "k", metaKey: true })).toBe(true);
    expect(toucheDeClavierPhysique({ key: "Tab" })).toBe(true);
    expect(toucheDeClavierPhysique({ key: "ArrowLeft" })).toBe(true);
  });
  it("lettre seule (clavier virtuel) : non", () => {
    expect(toucheDeClavierPhysique({ key: "a" })).toBe(false);
  });
});

describe("suivreEntrees", () => {
  it("suit le branchement d'un trackpad et prévient une seule fois", () => {
    const { mm, changer } = faussesMedias({});
    const suivi = suivreEntrees({ mm, cible: document.createElement("div") });
    const f = vi.fn();
    suivi.ecouter(f);
    expect(f).toHaveBeenLastCalledWith({ pointeur: false, clavier: false });
    changer("(hover: hover)", true);
    expect(f).toHaveBeenLastCalledWith({ pointeur: true, clavier: true });
    changer("(hover: hover)", false);
    expect(f).toHaveBeenLastCalledWith({ pointeur: false, clavier: false });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("une touche de clavier physique active le clavier pour la session", () => {
    const { mm } = faussesMedias({});
    const cible = document.createElement("div");
    const suivi = suivreEntrees({ mm, cible });
    cible.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(suivi.lire().clavier).toBe(false);
    cible.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    expect(suivi.lire().clavier).toBe(true);
  });
});
