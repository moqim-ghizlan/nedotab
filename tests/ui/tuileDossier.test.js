import { describe, expect, it } from "vitest";
import { creerIconeDossier, libelleDossier } from "../../src/ui/tuileDossier.js";

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, icone: { type: "lettre", lettre: "A", couleur: "#123456" } });
const dossier = (id, items = []) => ({ id, type: "dossier", titre: id, items });

describe("icône de dossier : éléments directs seulement", () => {
  it("un sous-dossier donne un glyphe, pas les icônes de ses sites", () => {
    const d = dossier("Dev", [dossier("Music", [site("yt"), site("ytm")]), site("a")]);
    const icone = creerIconeDossier(d);
    expect(icone.querySelectorAll(".mini--dossier")).toHaveLength(1);
    expect(icone.querySelector(".mini--dossier").title).toBe("Music");
    expect(icone.querySelectorAll(".mini:not(.mini--vide):not(.mini--dossier)")).toHaveLength(1);
  });
  it("que des sous-dossiers : pas de case vide trompeuse", () => {
    const icone = creerIconeDossier(dossier("D", [dossier("S", [site("x")])]));
    expect(icone.classList.contains("tuile-icone--dossier-vide")).toBe(false);
    expect(icone.querySelectorAll(".mini--dossier")).toHaveLength(1);
  });
  it("dossier vide", () => {
    expect(creerIconeDossier(dossier("V")).classList.contains("tuile-icone--dossier-vide")).toBe(true);
  });
  it("libellé : sous-dossiers comptés", () => {
    expect(libelleDossier(dossier("D", [dossier("S", [site("x")]), site("y")]))).toBe(
      "Dossier D, 2 éléments, 1 sous-dossier",
    );
  });
});

describe("icône personnalisée de dossier", () => {
  it("affiche le glyphe choisi à la place de l'aperçu", () => {
    const d = { ...dossier("D", [site("a")]), icone: { type: "glyphe", id: "musique", couleur: "#336699" } };
    const i = creerIconeDossier(d);
    expect(i.classList.contains("tuile-icone--dossier-perso")).toBe(true);
    expect(i.querySelector(".tuile-icone--glyphe")).not.toBeNull();
    expect(i.querySelector(".mini")).toBeNull();
  });
  it("garde le repère de sous-dossier", () => {
    const d = { ...dossier("D", [dossier("S", [site("a")])]), icone: { type: "lettre", couleur: "#336699", texte: "D" } };
    expect(creerIconeDossier(d).querySelector(".badge-sous-dossier")).not.toBeNull();
  });
});
