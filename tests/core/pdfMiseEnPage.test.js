import { describe, expect, it } from "vitest";
import { PAGE, creerPdfTodo, mettreEnPage } from "../../src/core/pdfMiseEnPage.js";
import { documentTodo } from "../../src/ui/todos/pdfTodo.js";

const mesurer = (t, taille) => t.length * taille * 0.5;
const jpeg = (largeur, hauteur) => ({ octets: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), largeur, hauteur });
const piste = (i, extra = {}) => ({ titre: `Piste ${i}`, description: `Texte de la piste ${i}.`, image: null, ...extra });
const doc = (pistes, extra = {}) => ({ titre: "Mon todo", sujet: "Projet", infos: ["Créé le 1 janvier 2026"], date: "14 novembre 2026", pistes, ...extra });
const texte = (octets) => Buffer.from(octets).toString("latin1");

describe("mise en page du PDF", () => {
  it("un todo sans piste : une page, l'en-tête et une note", () => {
    const { pages, images } = mettreEnPage(doc([]), mesurer);
    expect(pages).toHaveLength(1);
    expect(images).toHaveLength(0);
    const t = pages[0].join("\n");
    expect(t).toContain("(PROJET)");
    expect(t).toContain("(Mon todo)");
    expect(t).toContain("(Aucune piste.)");
    expect(t).toContain("Page 1 / 1)");
  });

  it("une piste : numéro, titre, texte, pied de page", () => {
    const { pages } = mettreEnPage(doc([piste(1)]), mesurer);
    const t = pages[0].join("\n");
    expect(t).toContain("(01)");
    expect(t).toContain("(Piste 1)");
    expect(t).toContain("(Texte de la piste 1.)");
    expect(t).toContain("(NedoTab");
  });

  it("numérote « Page n / N » sur toutes les pages", () => {
    const pistes = Array.from({ length: 12 }, (_, i) => piste(i + 1, { description: "ligne ".repeat(120) }));
    const { pages } = mettreEnPage(doc(pistes), mesurer);
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((ops, i) => expect(ops.join("\n")).toContain(`(14 novembre 2026   ·   Page ${i + 1} / ${pages.length})`));
  });

  it("garde chaque image entière, avec son ratio, et la passe à la page suivante si besoin", () => {
    const pistes = [piste(1, { image: jpeg(1600, 1200) }), piste(2, { image: jpeg(800, 2400) }), piste(3, { image: jpeg(2000, 500) })];
    const { pages, images } = mettreEnPage(doc(pistes), mesurer);
    expect(images).toHaveLength(3);
    const dessins = pages.flatMap((ops) => ops.filter((o) => / Do Q$/.test(o)));
    expect(dessins).toHaveLength(3);
    for (const d of dessins) {
      const [w, , , h, x, y] = d.replace(/^q /, "").split(" ").map(Number);
      expect(h).toBeLessThanOrEqual(300.01);
      expect(w).toBeLessThanOrEqual(PAGE.largeur - 112);
      expect(y).toBeGreaterThanOrEqual(64 - 0.01); // never into the footer
      expect(x).toBeGreaterThan(0);
    }
  });

  it("un très long texte déborde sur plusieurs pages sans perdre de ligne", () => {
    const longueur = Array.from({ length: 3000 }, (_, i) => `mot${i}`).join(" ");
    const { pages } = mettreEnPage(doc([piste(1, { description: longueur })]), mesurer);
    expect(pages.length).toBeGreaterThan(1);
    const tout = pages.flat().join(" ");
    for (const i of [0, 1500, 2999]) expect(tout).toContain(`mot${i}`);
  });

  it("n'écrit jamais un caractère hors du jeu Latin-1 tel quel (emoji → ?)", () => {
    const { pages } = mettreEnPage(doc([piste(1, { description: "Bravo 🎉 écrit (entre) parenthèses" })]), mesurer);
    const t = pages[0].join("\n");
    const bs = String.fromCharCode(92);
    expect(t).toContain(`Bravo ? écrit ${bs}(entre${bs}) parenthèses`);
  });

  it("produit un PDF valide : en-tête, objets, xref, un XObject par image", () => {
    const pdf = creerPdfTodo(doc([piste(1, { image: jpeg(100, 100) }), piste(2, { image: jpeg(50, 80) })]), mesurer);
    const t = texte(pdf);
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
    expect((t.match(/\/Subtype \/Image/g) ?? []).length).toBe(2);
    expect(t).toContain("/Im1 5 0 R");
    expect(t).toContain("/Im2 6 0 R");
    const debutXref = Number(/startxref\n(\d+)/.exec(t)[1]);
    expect(t.slice(debutXref, debutXref + 4)).toBe("xref");
    // every offset of the table points to "N 0 obj"
    const lignes = t.slice(debutXref).split("\n").filter((l) => /^\d{10} 00000 n/.test(l));
    lignes.forEach((l, i) => expect(t.slice(Number(l.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("1, 5 et 20 pistes, avec ou sans image, tiennent dans un PDF léger", () => {
    for (const n of [1, 5, 20]) {
      const pistes = Array.from({ length: n }, (_, i) => piste(i + 1, { image: i % 2 ? jpeg(1200, 800) : null }));
      const pdf = creerPdfTodo(doc(pistes), mesurer);
      expect(pdf.length).toBeLessThan(200_000);
    }
  });
});

describe("documentTodo", () => {
  it("prépare l'en-tête et les pistes", () => {
    const d = documentTodo({
      todo: { titre: "T", creeLe: Date.UTC(2026, 0, 1), modifieLe: Date.UTC(2026, 0, 1), fait: true, echeance: "2026-12-31", pistes: [{ id: "a", titre: "A", description: "x" }, { id: "b", titre: "", description: "" }] },
      sujet: "S",
      images: { a: jpeg(1, 1) },
      indisponibles: ["b"],
      maintenant: Date.UTC(2026, 10, 14),
    });
    expect(d.infos.filter(Boolean)).toEqual([expect.stringMatching(/^Créé le/), "Échéance : 2026-12-31", "Fait"]);
    expect(d.pistes[0].image).toBeTruthy();
    expect(d.pistes[1].imageIndisponible).toBe(true);
  });
});
