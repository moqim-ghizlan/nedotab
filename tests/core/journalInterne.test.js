import { describe, expect, it } from "vitest";
import { assainir, creerJournalInterne, texteSur } from "../../src/core/journal.js";

describe("journal interne", () => {
  it("tampon circulaire : la 501e entrée efface la 1re", () => {
    const j = creerJournalInterne({ max: 500 });
    for (let i = 1; i <= 501; i++) j.ajouter("sync", `entrée ${i}`);
    expect(j.taille()).toBe(500);
    expect(j.dernieres()[0].message).toBe("entrée 2");
    expect(j.dernieres(1)[0].message).toBe("entrée 501");
  });

  it("garde l'heure, la catégorie et le niveau", () => {
    const j = creerJournalInterne({ horloge: () => 42 });
    j.ajouter("erreur", "boum", { niveau: "erreur" });
    expect(j.dernieres()).toEqual([
      { t: 42, niveau: "erreur", categorie: "erreur", message: "boum" },
    ]);
  });
});

describe("assainir", () => {
  it("réduit une URL complète à son domaine", () => {
    expect(assainir("échec sur https://exemple.fr/prive/page?x=1#a")).toBe("échec sur exemple.fr");
  });
  it("masque les e-mails et les jetons", () => {
    const sortie = assainir(
      "user jean.dupont@exemple.fr jeton eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9abc123",
    );
    expect(sortie).not.toContain("jean.dupont");
    expect(sortie).not.toContain("eyJhbGci");
    expect(sortie).toContain("[e-mail]");
    expect(sortie).toContain("[jeton]");
  });
  it("laisse un message ordinaire intact", () => {
    expect(assainir("opérations reprises 3")).toBe("opérations reprises 3");
  });
});

describe("texteSur", () => {
  it("nettoie aussi les URL d'une trace d'erreur", () => {
    const e = new Error("échec");
    e.stack = "Error: échec\n    at https://nedotab-app.web.app/assets/index-abc.js:1:2";
    const t = texteSur(e);
    expect(t).not.toContain("/assets/");
    expect(t).toContain("nedotab-app.web.app");
  });
  it("accepte objets, nombres et valeurs circulaires", () => {
    const rond = {};
    rond.soi = rond;
    expect(texteSur({ a: 1 })).toBe('{"a":1}');
    expect(texteSur(7)).toBe("7");
    expect(() => texteSur(rond)).not.toThrow();
  });
  it("coupe les messages trop longs", () => {
    expect(texteSur("x".repeat(1000), 50)).toHaveLength(51);
  });
});
