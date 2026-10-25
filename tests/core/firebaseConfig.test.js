import { describe, expect, it } from "vitest";
import { lireConfig, PROJET_DEMO } from "../../src/firebase/config.js";

const complet = {
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "p",
  VITE_FIREBASE_STORAGE_BUCKET: "p.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "a",
};

describe("configuration Firebase", () => {
  it("lit toutes les valeurs", () => {
    expect(lireConfig(complet)).toEqual({
      emulateurs: false,
      config: {
        apiKey: "k",
        authDomain: "p.firebaseapp.com",
        projectId: "p",
        storageBucket: "p.appspot.com",
        messagingSenderId: "1",
        appId: "a",
      },
    });
  });
  it("erreur lisible qui nomme la variable manquante", () => {
    const { VITE_FIREBASE_APP_ID, ...incomplet } = complet;
    void VITE_FIREBASE_APP_ID;
    expect(() => lireConfig(incomplet)).toThrow(/VITE_FIREBASE_APP_ID manquante.*\.env\.local/);
  });
  it("émulateurs sans configuration : projet de démonstration local", () => {
    const r = lireConfig({ VITE_UTILISER_EMULATEURS: "true" });
    expect(r.emulateurs).toBe(true);
    expect(r.config.projectId).toBe(PROJET_DEMO);
  });
  it("émulateurs avec un vrai projet configuré : toujours le projet de démonstration", () => {
    const r = lireConfig({ ...complet, VITE_UTILISER_EMULATEURS: "true" });
    expect(r.config.projectId).toBe(PROJET_DEMO);
  });
  it("application web : connexion sur le domaine Hosting, jamais firebaseapp.com", () => {
    expect(lireConfig({ ...complet, VITE_TARGET: "pwa" }).config.authDomain).toBe("p.web.app");
    expect(
      lireConfig({ ...complet, VITE_TARGET: "pwa", VITE_FIREBASE_AUTH_DOMAIN_PWA: "app.fr" }).config
        .authDomain,
    ).toBe("app.fr");
    expect(lireConfig({ ...complet, VITE_TARGET: "extension" }).config.authDomain).toBe(
      "p.firebaseapp.com",
    );
  });
});
