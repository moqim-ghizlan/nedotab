import { describe, expect, it } from "vitest";
import { texteEnvoi } from "../../src/core/etatEnvoi.js";

const base = { horsLigne: false, maintenant: 10_000 };

describe("texteEnvoi", () => {
  it("rien quand tout est envoyé", () => {
    expect(texteEnvoi({ ...base, enAttente: 0, depuis: null }).texte).toBe("");
  });
  it("rien pour une attente brève (moins de 5 s)", () => {
    expect(texteEnvoi({ ...base, enAttente: 2, depuis: 6_000 }).texte).toBe("");
  });
  it("un message quand l'attente dure", () => {
    expect(texteEnvoi({ ...base, enAttente: 2, depuis: 4_000 }).texte).toBe("Envoi en cours (2)");
  });
  it("hors ligne : toujours dit", () => {
    expect(texteEnvoi({ ...base, horsLigne: true, enAttente: 0, depuis: null }).texte).toBe("Hors ligne");
    expect(texteEnvoi({ ...base, horsLigne: true, enAttente: 3, depuis: 9_999 }).texte).toContain("3 en attente");
  });
});
