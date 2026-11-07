import { describe, expect, it } from "vitest";
import { codeWinAnsi, creerPdf, decouperLignes, textePdf } from "../../src/core/pdf.js";

const texte = (octets) => String.fromCharCode(...octets);
const mesure = (t) => t.length * 6;

describe("textePdf", () => {
  it("garde les accents et les guillemets, remplace ce que la police ne sait pas dessiner", () => {
    expect(textePdf("é à ç « ” € …")).toBe("é à ç «   ");
    expect(codeWinAnsi("€")).toBe(0x80);
    expect(codeWinAnsi("é")).toBe(0xe9);
    expect(textePdf("ok 😀 日本")).toBe("ok ? ??");
    expect(textePdf("a b\tc")).toBe("a b c");
  });
});

describe("decouperLignes", () => {
  it("coupe entre les mots, garde les lignes vides et les retours", () => {
    expect(decouperLignes("un deux trois quatre", 60, mesure)).toEqual(["un deux", "trois", "quatre"]);
    expect(decouperLignes("a\n\nb", 100, mesure)).toEqual(["a", "", "b"]);
  });
  it("coupe un mot plus long qu'une ligne", () => {
    const l = decouperLignes("x".repeat(25), 60, mesure);
    expect(l.join("")).toBe("x".repeat(25));
    expect(l.every((x) => mesure(x) <= 60)).toBe(true);
  });
});

describe("creerPdf", () => {
  const lignes = (n) => Array.from({ length: n }, (_, i) => ({ texte: String.raw`Ligne ${i} (avec \ parenthèses)`, taille: 12 }));
  it("un PDF valide : en-tête, fin, table xref aux bons décalages", () => {
    const pdf = creerPdf({ lignes: lignes(3) });
    const t = texte(pdf);
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
    const debutXref = Number(t.match(/startxref\n(\d+)/)[1]);
    expect(t.slice(debutXref, debutXref + 4)).toBe("xref");
    const entrees = [...t.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entrees.forEach((pos, i) => expect(t.slice(pos, pos + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(t).toContain(String.raw`\(avec \\ parenth`);
  });
  it("beaucoup de lignes : plusieurs pages", () => {
    const t = texte(creerPdf({ lignes: lignes(120) }));
    expect(Number(t.match(/\/Count (\d+)/)[1])).toBeGreaterThan(1);
  });
  it("avec image JPEG : un objet image, dessiné sur la page", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const t = texte(creerPdf({ lignes: lignes(2), image: { octets: jpeg, largeur: 800, hauteur: 600 } }));
    expect(t).toContain("/Filter /DCTDecode");
    expect(t).toContain("/Length 7");
    expect(t).toContain("/Im1 Do");
  });
});
