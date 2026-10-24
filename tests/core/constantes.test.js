import { describe, expect, it } from "vitest";
import { NOM_APP } from "../../src/core/constantes.js";

describe("constantes", () => {
  it("NOM_APP est une chaîne non vide", () => {
    expect(typeof NOM_APP).toBe("string");
    expect(NOM_APP.length).toBeGreaterThan(0);
  });
});
