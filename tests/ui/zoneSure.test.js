import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dossier = "src/ui/styles";

describe("zone sûre (TODO 13)", () => {
  const css = readdirSync(dossier).filter((f) => f.endsWith(".css"));
  it("les quatre jetons sont définis une seule fois, dans tokens.css", () => {
    const t = readFileSync(`${dossier}/tokens.css`, "utf8");
    for (const [jeton, bord] of [["haut", "top"], ["bas", "bottom"], ["gauche", "left"], ["droite", "right"]])
      expect(t).toContain(`--safe-${jeton}: env(safe-area-inset-${bord}, 0px);`);
  });
  it("aucune autre feuille n'appelle env(safe-area-inset-*) directement", () => {
    for (const f of css.filter((x) => x !== "tokens.css")) expect(readFileSync(`${dossier}/${f}`, "utf8"), f).not.toContain("env(safe-area-inset");
  });
  it("l'en-tête de la galerie et celui de la visionneuse passent sous la zone sûre du haut", () => {
    expect(readFileSync(`${dossier}/galerie.css`, "utf8")).toMatch(/\.pgal-entete \{[^}]*var\(--safe-haut\)/s);
    expect(readFileSync(`${dossier}/todos.css`, "utf8")).toMatch(/\.visionneuse-haut \{[^}]*var\(--safe-haut\)/);
  });
});

describe("feuille d'actions (popover) : elle doit avoir une taille", () => {
  it("la feuille est un popover : sans largeur et hauteur elle fait 0 × 0 et seule la copie de la tuile flotte", () => {
    const css = readFileSync(`${dossier}/menus.css`, "utf8");
    const regle = css.match(/\.feuille-actions \{[^}]*\}/s)[0];
    expect(regle).toMatch(/width: 100vw/);
    expect(regle).toMatch(/height: 100dvh/);
  });
  it("la fenêtre de dossier en sortie annule le flou du réglage d'opacité", () => {
    const css = readFileSync(`${dossier}/dossiers.css`, "utf8");
    expect(css).toMatch(/:root\[data-opacite-dossier\] \.fenetre-dossier\.fenetre-dossier--sortie/);
  });
});
