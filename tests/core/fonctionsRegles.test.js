import { describe, expect, it } from "vitest";
import { AGE_CONNEXION_MAX_S, connexionRecente, stockageAbsent } from "../../functions/regles.js";

const maintenant = Date.UTC(2026, 9, 24, 12, 0, 0);
const s = (ms) => Math.floor(ms / 1000);

describe("suppression du compte : connexion récente exigée", () => {
  it("5 minutes au plus", () => {
    expect(AGE_CONNEXION_MAX_S).toBe(300);
    expect(connexionRecente(s(maintenant) - 10, maintenant)).toBe(true);
    expect(connexionRecente(s(maintenant) - 300, maintenant)).toBe(true);
    expect(connexionRecente(s(maintenant) - 301, maintenant)).toBe(false);
  });
  it("heure absente ou dans le futur : refusée", () => {
    expect(connexionRecente(undefined, maintenant)).toBe(false);
    expect(connexionRecente(s(maintenant) + 3600, maintenant)).toBe(false);
  });
  it("décalage d'horloge de quelques secondes toléré", () => {
    expect(connexionRecente(s(maintenant) + 5, maintenant)).toBe(true);
  });
});

describe("stockage absent (forfait gratuit, aucun fichier)", () => {
  it("404 et messages « not found » : rien à supprimer", () => {
    expect(stockageAbsent({ code: 404 })).toBe(true);
    expect(stockageAbsent(new Error("The specified bucket does not exist."))).toBe(true);
    expect(stockageAbsent(new Error("Not Found"))).toBe(true);
  });
  it("autres erreurs : remontées", () => {
    expect(stockageAbsent({ code: 403, message: "Forbidden" })).toBe(false);
  });
});
