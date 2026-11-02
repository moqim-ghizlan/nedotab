import { describe, expect, it, vi } from "vitest";
import { creerAuthEmail } from "../../src/firebase/auth.email.js";

function monter({ verifie = false, echec } = {}) {
  const utilisateur = {
    uid: "u1",
    email: "alice@exemple.fr",
    emailVerified: verifie,
    reload: vi.fn(async function () {
      this.emailVerified = true;
    }),
    getIdToken: vi.fn(async () => "jeton"),
  };
  const sdk = {
    createUserWithEmailAndPassword: vi.fn(async () => ({ user: utilisateur })),
    signInWithEmailAndPassword: vi.fn(async () => {
      if (echec) throw Object.assign(new Error("x"), { code: echec });
      return { user: utilisateur };
    }),
    sendEmailVerification: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
    reauthenticateWithCredential: vi.fn(async () => {}),
    linkWithCredential: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    EmailAuthProvider: { credential: vi.fn((email, mdp) => ({ email, mdp })) },
  };
  const outils = creerAuthEmail({
    auth: () => ({ currentUser: utilisateur }),
    sdk,
    versProfil: (u) => ({ uid: u.uid, email: u.email, emailVerifie: u.emailVerified }),
  });
  return { outils, sdk, utilisateur };
}

describe("auth.email (SDK simulé)", () => {
  it("inscription : e-mail normalisé, mail de vérification envoyé, profil non vérifié", async () => {
    const { outils, sdk } = monter();
    const p = await outils.inscrire("  Alice@Exemple.fr ", "motdepasse-long");
    expect(sdk.createUserWithEmailAndPassword.mock.calls[0].slice(1)).toEqual([
      "alice@exemple.fr",
      "motdepasse-long",
    ]);
    expect(sdk.sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(p.emailVerifie).toBe(false);
  });
  it("inscription refusée avant tout appel réseau si e-mail ou mot de passe invalide", async () => {
    const { outils, sdk } = monter();
    await expect(outils.inscrire("pasunemail", "motdepasse-long")).rejects.toMatchObject({
      code: "auth/invalid-email",
    });
    await expect(outils.inscrire("a@b.fr", "court")).rejects.toMatchObject({
      code: "auth/weak-password",
    });
    expect(sdk.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });
  it("« J'ai vérifié » recharge l'utilisateur ET rafraîchit le jeton", async () => {
    const { outils, utilisateur } = monter();
    const p = await outils.actualiserVerification();
    expect(utilisateur.reload).toHaveBeenCalled();
    expect(utilisateur.getIdToken).toHaveBeenCalledWith(true);
    expect(p.emailVerifie).toBe(true);
  });
  it("réinitialisation : pas d'erreur sur adresse valide, refus sur adresse invalide", async () => {
    const { outils, sdk } = monter();
    await outils.reinitialiser("Alice@exemple.fr");
    expect(sdk.sendPasswordResetEmail.mock.calls[0][1]).toBe("alice@exemple.fr");
    await expect(outils.reinitialiser("nope")).rejects.toBeTruthy();
  });
  it("ré-authentification : identifiants du compte, jeton rafraîchi", async () => {
    const { outils, sdk, utilisateur } = monter({ verifie: true });
    await outils.reauthentifier("monmotdepasse");
    expect(sdk.EmailAuthProvider.credential).toHaveBeenCalledWith(
      "alice@exemple.fr",
      "monmotdepasse",
    );
    expect(sdk.reauthenticateWithCredential).toHaveBeenCalled();
    expect(utilisateur.getIdToken).toHaveBeenCalledWith(true);
  });
  it("ajouter un mot de passe lie le fournisseur au même utilisateur (même uid)", async () => {
    const { outils, sdk, utilisateur } = monter({ verifie: true });
    const p = await outils.ajouterMotDePasse("motdepasse-long");
    expect(sdk.linkWithCredential).toHaveBeenCalledWith(utilisateur, expect.anything());
    expect(p.uid).toBe("u1");
    await expect(outils.ajouterMotDePasse("court")).rejects.toMatchObject({
      code: "auth/weak-password",
    });
  });
  it("changer le mot de passe : ré-authentification d'abord", async () => {
    const { outils, sdk } = monter({ verifie: true });
    await outils.changerMotDePasse("ancienmotdepasse", "nouveaumotdepasse");
    const ordre = [
      sdk.reauthenticateWithCredential.mock.invocationCallOrder[0],
      sdk.updatePassword.mock.invocationCallOrder[0],
    ];
    expect(ordre[0]).toBeLessThan(ordre[1]);
  });
  it("aucun mot de passe n'est renvoyé ni conservé par le module", async () => {
    const { outils } = monter();
    const p = await outils.connecter("alice@exemple.fr", "secret-secret-1");
    expect(JSON.stringify(p)).not.toContain("secret-secret-1");
  });
});
