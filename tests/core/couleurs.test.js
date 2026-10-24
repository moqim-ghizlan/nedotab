import { describe, expect, it } from "vitest";
import { PALETTE, couleurDepuisTexte, lettrePourSite } from "../../src/core/couleurs.js";

describe("couleurs", () => {
  it("même entrée, même couleur, issue de la palette", () => {
    expect(couleurDepuisTexte("github.com")).toBe(couleurDepuisTexte("github.com"));
    expect(couleurDepuisTexte("https://www.github.com/x")).toBe(couleurDepuisTexte("github.com"));
    expect(PALETTE).toContain(couleurDepuisTexte("exemple.fr"));
  });
  it("gère les chaînes vides", () => {
    expect(PALETTE).toContain(couleurDepuisTexte(""));
    expect(PALETTE).toContain(couleurDepuisTexte(undefined));
  });
  it("lettre : titre, puis domaine, puis ?", () => {
    expect(lettrePourSite({ titre: "  éole", url: "https://x.com" })).toBe("É");
    expect(lettrePourSite({ titre: "!!!", url: "https://www.zeta.com" })).toBe("Z");
    expect(lettrePourSite({ titre: "", url: "" })).toBe("?");
  });
});
