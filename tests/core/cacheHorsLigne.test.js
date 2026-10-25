import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { cacheHorsLigneDisponible } from "../../src/firebase/app.js";

describe("cache hors ligne (V3.3)", () => {
  it("IndexedDB disponible : oui", async () => {
    expect(await cacheHorsLigneDisponible()).toBe(true);
  });
  it("sans IndexedDB, ou IndexedDB qui échoue (navigation privée) : non, sans planter", async () => {
    expect(await cacheHorsLigneDisponible(null)).toBe(false);
    const enErreur = {
      open: () => {
        const req = {};
        queueMicrotask(() => req.onerror?.());
        return req;
      },
    };
    expect(await cacheHorsLigneDisponible(enErreur)).toBe(false);
    const quiLance = {
      open: () => {
        throw new DOMException("bloqué", "SecurityError");
      },
    };
    expect(await cacheHorsLigneDisponible(quiLance)).toBe(false);
  });
});
