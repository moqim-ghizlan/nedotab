import { describe, expect, it } from "vitest";
import { messageErreurIa } from "../../src/ui/messagesIa.js";

describe("messageErreurIa", () => {
  it("la raison précise du serveur a priorité", () => {
    expect(
      messageErreurIa({ code: "functions/failed-precondition", details: { code: "cle-invalide" } }),
    ).toMatch(/Clé refusée/);
  });
  it("quota : le message du serveur (limite et remise à zéro)", () => {
    const message = "Limite quotidienne atteinte (300 appels). Elle se réinitialise à minuit.";
    expect(
      messageErreurIa({
        code: "functions/resource-exhausted",
        message,
        details: { code: "quota-depasse" },
      }),
    ).toBe(message);
  });
  it("non connecté, ou erreur inconnue", () => {
    expect(messageErreurIa({ code: "functions/unauthenticated" })).toMatch(/Connectez-vous/);
    expect(messageErreurIa(new Error("x"))).toMatch(/indisponible/);
  });
});
