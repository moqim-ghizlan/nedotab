import { describe, expect, it } from "vitest";
import { echapperTexte, nomFichierSain, todoVersMarkdown } from "../../src/core/exportTodoMd.js";

describe("nomFichierSain", () => {
  it("retire les caractères interdits sous Windows", () => {
    expect(nomFichierSain('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j");
  });
  it("titre vide ou réservé : « todo »", () => {
    expect(nomFichierSain("   ")).toBe("todo");
    expect(nomFichierSain("...")).toBe("todo");
    expect(nomFichierSain("CON")).toBe("todo");
    expect(nomFichierSain(null)).toBe("todo");
  });
  it("longueur limitée, pas de point final", () => {
    expect(nomFichierSain("x".repeat(200)).length).toBe(60);
    expect(nomFichierSain("fin.")).toBe("fin");
  });
});

describe("todoVersMarkdown", () => {
  const base = { titre: "Acheter du pain", description: "", creeLe: Date.UTC(2026, 10, 6, 12), modifieLe: Date.UTC(2026, 10, 6, 12) };
  it("sans image : titre, sujet, date, aucune image", () => {
    const md = todoVersMarkdown(base, { sujet: "Maison" });
    expect(md.startsWith("# Acheter du pain\n")).toBe(true);
    expect(md).toContain("**Sujet** : Maison");
    expect(md).toContain("**Créé**");
    expect(md).not.toContain("![");
    expect(md).not.toContain("Modifié");
  });
  it("avec image : lien relatif", () => {
    expect(todoVersMarkdown(base, { cheminImage: "images/image.webp" })).toContain("![Image du todo](images/image.webp)");
  });
  it("image illisible : mention, pas d'échec", () => {
    expect(todoVersMarkdown(base, { imageIndisponible: true })).toContain("Image indisponible");
  });
  it("les caractères Markdown du titre et de la description sont neutralisés", () => {
    const md = todoVersMarkdown({ ...base, titre: "# *gras* [lien](http://x) <b>", description: "- liste\n1. un\n![img](x)\n<script>x</script>" });
    expect(md.split("\n")[0]).toBe("# \\# \\*gras\\* \\[lien\\](http://x) \\<b\\>");
    expect(md).toContain("\\- liste");
    expect(md).toContain("1\\. un");
    expect(md).toContain("\\!\\[img\\](x)");
    expect(md).toContain("\\<script\\>");
    expect(md).not.toMatch(/^!\[/m);
  });
  it("les retours à la ligne sont gardés", () => {
    expect(echapperTexte("a\nb\n\nc")).toBe("a  \nb  \n\nc");
  });
  it("titre vide : « Sans titre »", () => {
    expect(todoVersMarkdown({ ...base, titre: "  " }).startsWith("# Sans titre")).toBe(true);
  });
});

describe("todoVersMarkdown : pistes (7.3)", () => {
  const todo = {
    titre: "Voyage",
    creeLe: null,
    pistes: [
      { id: "a", titre: "Billets", description: "Train ou avion ?", imageId: "i1" },
      { id: "b", titre: "", description: "Réserver l'hôtel", imageId: null },
      { id: "c", titre: "Photo", description: "", imageId: "i2" },
    ],
  };
  it("écrit une section par piste, avec ses images", () => {
    const md = todoVersMarkdown(todo, { cheminsImages: { a: "images/piste-1.webp" }, imagesIndisponibles: ["c"] });
    expect(md).toContain("# Voyage");
    expect(md).toContain("## Billets");
    expect(md).toContain("![Billets](images/piste-1.webp)");
    expect(md).toContain("## Piste 2");
    expect(md).toContain("Réserver l'hôtel");
    expect(md).toContain("## Photo");
    expect(md).toContain("_Image indisponible au moment de l'export._");
  });
  it("une seule piste sans titre : pas de sous-titre", () => {
    const md = todoVersMarkdown({ titre: "Seul", pistes: [{ id: "a", titre: "", description: "Texte", imageId: null }] });
    expect(md).not.toContain("##");
    expect(md).toContain("Texte");
  });
});
