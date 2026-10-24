import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: vi.fn(),
}));
const { initializeAppCheck } = await import("firebase/app-check");
const { activerAppCheck } = await import("../../src/firebase/appCheck.js");

describe("App Check", () => {
  it("jamais dans l'extension", () => {
    expect(
      activerAppCheck({}, { VITE_TARGET: "extension", VITE_APPCHECK_CLE_RECAPTCHA: "k" }),
    ).toBe(false);
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });
  it("PWA sans clé : désactivé", () => {
    expect(activerAppCheck({}, { VITE_TARGET: "pwa" })).toBe(false);
  });
  it("PWA avec clé : activé, sans jeton de debug hors développement", () => {
    delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
    expect(
      activerAppCheck({}, { VITE_TARGET: "pwa", VITE_APPCHECK_CLE_RECAPTCHA: "k", DEV: false }),
    ).toBe(true);
    expect(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });
  it("jeton de debug seulement en développement avec les émulateurs", () => {
    activerAppCheck(
      {},
      {
        VITE_TARGET: "pwa",
        VITE_APPCHECK_CLE_RECAPTCHA: "k",
        DEV: true,
        VITE_UTILISER_EMULATEURS: "true",
      },
    );
    expect(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
  });
});
