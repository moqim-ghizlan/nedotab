import { afterAll, describe, expect, it } from "vitest";

// Uses the real auth module against the Auth emulator ("demo-nedotab" project).
const { connecter, deconnecter, ecouterUtilisateur, obtenirAuth } =
  await import("../../src/firebase/auth.extension.js");

const jetons = (email) => ({
  obtenirJeton: async () => ({
    idToken: JSON.stringify({
      sub: `google-${email}`,
      email,
      email_verified: true,
      name: "Alice Test",
    }),
  }),
  oublierJeton: async () => {},
});

afterAll(async () => {
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-nedotab/accounts", {
    method: "DELETE",
  });
});

describe("connexion Google (émulateur Auth)", () => {
  it("connexion puis déconnexion suivies par ecouterUtilisateur", async () => {
    const etats = [];
    const arreter = ecouterUtilisateur((p) => etats.push(p?.email ?? null));
    const profil = await connecter(jetons("alice@nedotab.test"));
    expect(profil).toMatchObject({ email: "alice@nedotab.test", nom: "Alice Test" });
    expect(obtenirAuth().currentUser.uid).toBe(profil.uid);
    await deconnecter(jetons("alice@nedotab.test"));
    await new Promise((r) => setTimeout(r, 200));
    arreter();
    expect(etats).toContain("alice@nedotab.test");
    expect(etats.at(-1)).toBeNull();
  });
  it("le même compte Google garde le même uid", async () => {
    const a = await connecter(jetons("bob@nedotab.test"));
    await deconnecter(jetons("bob@nedotab.test"));
    const b = await connecter(jetons("bob@nedotab.test"));
    expect(b.uid).toBe(a.uid);
    await deconnecter(jetons("bob@nedotab.test"));
  });
});
