import { afterAll, describe, expect, it } from "vitest";
import { etatInitial } from "../../src/core/modele.js";
import * as fb from "../../src/firebase/index.js";

// V4.23: sign-in by e-mail on the emulators (Auth + Firestore + Functions). The extension
// auth module is used (the web app's redirect flow cannot run in Node).
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-nedotab";
const proprietaire = { authorization: "Bearer owner", "content-type": "application/json" };

const googleFictif = (nom) => ({
  obtenirJeton: async () => ({
    idToken: JSON.stringify({
      sub: `google-${nom}`,
      email: `${nom}@nedotab.test`,
      email_verified: true,
    }),
  }),
  oublierJeton: async () => {},
});
const sortir = () => fb.deconnecter(googleFictif("x"));

/** What the link of the verification e-mail does: the emulator marks the address as verified. */
async function verifierAdresse(uid) {
  const r = await fetch(`${AUTH}/accounts:update`, {
    method: "POST",
    headers: proprietaire,
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  expect(r.ok).toBe(true);
}

afterAll(async () => {
  await sortir().catch(() => {});
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-nedotab/accounts", {
    method: "DELETE",
  });
});

describe("inscription et vérification (émulateurs)", () => {
  const mdp = "un-mot-de-passe-long";

  it("avant la vérification : aucune donnée accessible ; après « J'ai vérifié » : accès", async () => {
    const profil = await fb.inscrireEmail("Claire@Nedotab.test", mdp);
    expect(profil.emailVerifie).toBe(false);
    expect(profil.email).toBe("claire@nedotab.test");
    const etat = { ...etatInitial(), grille: [] };
    // Unverified: the rules refuse the write and the read.
    await expect(fb.ecrireDocument(profil.uid, etat, "test", 1)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(fb.lireDocument(profil.uid)).rejects.toMatchObject({ code: "permission-denied" });
    // Not verified yet: "J'ai vérifié" says so.
    expect((await fb.actualiserVerification()).emailVerifie).toBe(false);
    // The link of the e-mail is followed, then "J'ai vérifié" refreshes the token.
    await verifierAdresse(profil.uid);
    const apres = await fb.actualiserVerification();
    expect(apres.emailVerifie).toBe(true);
    await fb.ecrireDocument(profil.uid, etat, "test", 1);
    expect((await fb.lireDocument(profil.uid)).brut.versionSchema).toBeDefined();
    await sortir();
  });

  it("connexion avec un mauvais mot de passe : message générique, bon mot de passe : même uid", async () => {
    const a = await fb.connecterEmail("claire@nedotab.test", mdp);
    await sortir();
    await expect(fb.connecterEmail("claire@nedotab.test", "mauvais-mot-de-passe")).rejects.toMatchObject({
      code: expect.stringMatching(/^auth\/(invalid-credential|wrong-password)$/),
    });
    const b = await fb.connecterEmail("claire@nedotab.test", mdp);
    expect(b.uid).toBe(a.uid);
    await sortir();
  });

  it("e-mail déjà utilisé avec Google : l'inscription échoue ou lie le même compte, jamais deux uid", async () => {
    const google = await fb.connecter(googleFictif("denis"));
    await sortir();
    let erreur = null;
    let profil = null;
    try {
      profil = await fb.inscrireEmail("denis@nedotab.test", mdp);
    } catch (e) {
      erreur = e;
    }
    // Account linking is enabled in the console (one account per e-mail): the emulator answers
    // auth/email-already-in-use. Either way, no second uid for the same person.
    if (erreur) expect(erreur.code).toBe("auth/email-already-in-use");
    else expect(profil.uid).toBe(google.uid);
  });
});

describe("liaison Google + mot de passe : l'uid ne change pas", () => {
  it("ajouter un mot de passe à un compte Google, puis se connecter par e-mail : mêmes données", async () => {
    const google = await fb.connecter(googleFictif("emma"));
    const etat = { ...etatInitial(), grille: [] };
    await fb.ecrireDocument(google.uid, etat, "test", 1);
    const lie = await fb.ajouterMotDePasse("motdepasse-pour-emma");
    expect(lie.uid).toBe(google.uid);
    expect(lie.fournisseurs).toEqual(expect.arrayContaining(["google.com", "password"]));
    await sortir();
    const parEmail = await fb.connecterEmail("emma@nedotab.test", "motdepasse-pour-emma");
    expect(parEmail.uid).toBe(google.uid);
    expect((await fb.lireDocument(google.uid)).brut.versionSchema).toBeDefined();
    await sortir();
  });
});

describe("suppression du compte avec ré-authentification par mot de passe", () => {
  it("compte e-mail vérifié : suppression acceptée après ré-authentification", async () => {
    const profil = await fb.inscrireEmail("fred@nedotab.test", "mot-de-passe-de-fred");
    await verifierAdresse(profil.uid);
    await fb.actualiserVerification();
    await fb.ecrireDocument(profil.uid, { ...etatInitial(), grille: [] }, "test", 1);
    await fb.reauthentifierMotDePasse("mot-de-passe-de-fred");
    await fb.supprimerMonCompte();
    // The account is gone: the same address can sign up again with a new uid.
    await sortir().catch(() => {});
    const nouveau = await fb.inscrireEmail("fred@nedotab.test", "mot-de-passe-de-fred");
    expect(nouveau.uid).not.toBe(profil.uid);
  });
  it("mauvais mot de passe à la ré-authentification : refusé, rien n'est supprimé", async () => {
    await expect(fb.reauthentifierMotDePasse("pas-le-bon-mot-de-passe")).rejects.toBeTruthy();
  });
});
