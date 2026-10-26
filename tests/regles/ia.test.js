import { afterAll, describe, expect, it } from "vitest";
import * as fb from "../../src/firebase/index.js";

// V4.0: the AI functions on the emulators (Auth, Functions, Firestore). No call reaches a
// real provider here: what needs one (a valid key) is covered by the unit tests with a
// fake provider (tests/fonctions/). The secret is the test one of functions/.secret.local.
const connecter = (nom) =>
  fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: `google-${nom}`,
        email: `${nom}@nedotab.test`,
        email_verified: true,
      }),
    }),
  });
const deconnecter = () =>
  fb.deconnecter({ obtenirJeton: async () => null, oublierJeton: async () => {} });
const erreur = (promesse) =>
  promesse.then(
    () => null,
    (e) => e,
  );

afterAll(deconnecter);

describe("fonctions IA (émulateurs)", () => {
  it("non connecté : refusé", async () => {
    await deconnecter();
    const e = await erreur(fb.appelerIa("iaEtatCles"));
    expect(e?.code).toBe("functions/unauthenticated");
  });

  it("connecté sans clé : état vide", async () => {
    await connecter("ia-vide");
    expect(await fb.appelerIa("iaEtatCles")).toEqual([]);
  });

  it("paramètres invalides : refusés avec la raison", async () => {
    await connecter("ia-params");
    const e = await erreur(
      fb.appelerIa("iaEnregistrerCle", { fournisseur: "openai", cle: "court" }),
    );
    expect(e?.code).toBe("functions/invalid-argument");
    expect(e?.details?.code).toBe("entree-invalide");
  });

  it("Gemini pas encore proposé (V4.1) : refusé", async () => {
    await connecter("ia-gemini");
    const e = await erreur(
      fb.appelerIa("iaEnregistrerCle", { fournisseur: "gemini", cle: "A".repeat(39) }),
    );
    expect(e?.code).toBe("functions/invalid-argument");
  });

  it("tester sans clé enregistrée : la raison est donnée", async () => {
    await connecter("ia-sans-cle");
    const e = await erreur(fb.appelerIa("iaTester", { fournisseur: "openai", modele: "modele-x" }));
    expect(e?.code).toBe("functions/failed-precondition");
    expect(e?.details?.code).toBe("cle-absente");
  });
});
