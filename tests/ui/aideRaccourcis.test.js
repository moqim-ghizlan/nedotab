import { afterEach, describe, expect, it, vi } from "vitest";
import { RACCOURCIS, raccourcisParGroupe } from "../../src/core/raccourcis.js";
import { brancherRaccourcisGlobaux } from "../../src/ui/aideRaccourcis.js";

let debrancher;
afterEach(() => {
  debrancher?.();
  document.body.replaceChildren();
});

const touche = (cible, init) => {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  cible.dispatchEvent(e);
  return e;
};

describe("raccourcis globaux", () => {
  it("« ? » ouvre l'aide, Cmd+, ouvre les réglages", () => {
    const ouvrirAide = vi.fn();
    const ouvrirReglages = vi.fn();
    debrancher = brancherRaccourcisGlobaux({ ouvrirReglages, ouvrirAide });
    touche(document.body, { key: "?" });
    expect(ouvrirAide).toHaveBeenCalledTimes(1);
    touche(document.body, { key: ",", metaKey: true });
    touche(document.body, { key: ",", ctrlKey: true });
    expect(ouvrirReglages).toHaveBeenCalledTimes(2);
  });

  it("rien dans un champ de saisie", () => {
    const ouvrirAide = vi.fn();
    const ouvrirReglages = vi.fn();
    debrancher = brancherRaccourcisGlobaux({ ouvrirReglages, ouvrirAide });
    const champ = document.createElement("input");
    document.body.append(champ);
    touche(champ, { key: "?" });
    touche(champ, { key: ",", metaKey: true });
    expect(ouvrirAide).not.toHaveBeenCalled();
    expect(ouvrirReglages).not.toHaveBeenCalled();
  });

  it("« , » seul ne fait rien", () => {
    const ouvrirReglages = vi.fn();
    debrancher = brancherRaccourcisGlobaux({ ouvrirReglages, ouvrirAide: vi.fn() });
    touche(document.body, { key: "," });
    expect(ouvrirReglages).not.toHaveBeenCalled();
  });
});

describe("table des raccourcis", () => {
  it("regroupée dans l'ordre, sans perdre de ligne", () => {
    const groupes = raccourcisParGroupe();
    expect(groupes.map(([g]) => g)).toEqual([
      "Recherche",
      "Grille",
      "Icône",
      "Fenêtres",
      "Assistant",
      "Aide",
    ]);
    expect(groupes.flatMap(([, l]) => l)).toHaveLength(RACCOURCIS.length);
  });
  it("aucun conflit avec les raccourcis de Safari et d'iPadOS", () => {
    const interdits = /Cmd \+ (T|W|L|N|R|Q)\b/;
    expect(RACCOURCIS.filter((r) => interdits.test(r.touche))).toEqual([]);
  });
});
