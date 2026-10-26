import { describe, expect, it } from "vitest";
import { abreger, formaterDiagnostic } from "../../src/core/diagnostic.js";

describe("formaterDiagnostic", () => {
  it("liste les infos puis le journal", () => {
    const texte = formaterDiagnostic({ Version: "3.10.0", Mode: "compte" }, [
      { t: Date.UTC(2026, 9, 26, 14, 5, 9), niveau: "info", categorie: "sync", message: "ok" },
      {
        t: Date.UTC(2026, 9, 26, 14, 5, 10),
        niveau: "erreur",
        categorie: "erreur",
        message: "boum",
      },
    ]);
    expect(texte).toContain("Version : 3.10.0");
    expect(texte).toContain("Mode : compte");
    expect(texte).toContain("14:05:09   [sync] ok");
    expect(texte).toContain("14:05:10 ! [erreur] boum");
    expect(texte).toContain("Journal (2 dernières entrées)");
  });

  it("n'expose aucune adresse ni URL complète", () => {
    const texte = formaterDiagnostic({
      Compte: "jean@exemple.fr",
      Page: "https://exemple.fr/prive?x=1",
    });
    expect(texte).not.toContain("jean@");
    expect(texte).not.toContain("/prive");
  });

  it("une valeur absente s'affiche « — »", () => {
    expect(formaterDiagnostic({ Révision: undefined })).toContain("Révision : —");
  });
});

describe("abreger", () => {
  it("coupe un identifiant", () => {
    expect(abreger("abcdefghijklmnop")).toBe("abcdefgh…");
    expect(abreger(null)).toBe("—");
  });
});
