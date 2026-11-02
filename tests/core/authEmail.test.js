import { describe, expect, it } from "vitest";
import {
  MESSAGES_ERREUR_AUTH,
  attenteRenvoi,
  libelleMethodes,
  methodesDeConnexion,
  normaliserEmail,
  traduireErreurAuth,
  validerEmail,
  validerMotDePasse,
} from "../../src/core/authEmail.js";
import { comptesAPurger, nettoyerComptes } from "../../functions/src/nettoyageComptes.js";
import { emailVerifie } from "../../functions/regles.js";

describe("validation (V4.23)", () => {
  it("e-mail : normalisé, forme vérifiée", () => {
    expect(normaliserEmail("  Alice@Exemple.FR ")).toBe("alice@exemple.fr");
    expect(validerEmail("alice@exemple.fr")).toBeNull();
    for (const mauvais of ["", "alice", "alice@", "@exemple.fr", "a b@exemple.fr", "a@b", "a@@b.fr"])
      expect(validerEmail(mauvais), mauvais).not.toBeNull();
  });
  it("mot de passe : 10 caractères au moins, aucune règle de complexité", () => {
    expect(validerMotDePasse("123456789")).toMatch(/10 caractères/);
    expect(validerMotDePasse("1234567890")).toBeNull();
    expect(validerMotDePasse("aaaaaaaaaaaa")).toBeNull();
    expect(validerMotDePasse("")).not.toBeNull();
    expect(validerMotDePasse("          ")).not.toBeNull();
    expect(validerMotDePasse("é".repeat(10))).toBeNull(); // 10 caractères, pas 10 octets
    expect(validerMotDePasse("x".repeat(129))).not.toBeNull();
  });
});

describe("traduireErreurAuth", () => {
  const codes = [
    "auth/wrong-password",
    "auth/email-already-in-use",
    "auth/too-many-requests",
    "auth/requires-recent-login",
    "auth/invalid-credential",
    "auth/user-not-found",
    "auth/weak-password",
    "auth/network-request-failed",
    "auth/invalid-email",
    "auth/account-exists-with-different-credential",
    "auth/expired-action-code",
  ];
  it.each(codes)("%s a un message en français", (code) => {
    const m = traduireErreurAuth({ code });
    expect(m).toBe(MESSAGES_ERREUR_AUTH[code]);
    expect(m).not.toContain("auth/");
  });
  it("compte inconnu et mauvais mot de passe : exactement le même message", () => {
    const a = traduireErreurAuth("auth/user-not-found");
    expect(traduireErreurAuth("auth/wrong-password")).toBe(a);
    expect(traduireErreurAuth("auth/invalid-credential")).toBe(a);
    expect(a).not.toMatch(/inconnu|existe/i);
  });
  it("email déjà utilisé : guide vers Google", () => {
    expect(traduireErreurAuth("auth/email-already-in-use")).toMatch(/Google/);
  });
  it("code inconnu : message générique avec le code pour le diagnostic", () => {
    expect(traduireErreurAuth({ code: "auth/zzz" })).toContain("auth/zzz");
    expect(traduireErreurAuth(undefined)).toMatch(/échoué/);
  });
});

describe("méthodes de connexion et renvoi", () => {
  it("Google, mot de passe, les deux", () => {
    expect(libelleMethodes(methodesDeConnexion(["google.com"]))).toBe("Google");
    expect(libelleMethodes(methodesDeConnexion(["password"]))).toBe("E-mail et mot de passe");
    expect(libelleMethodes(methodesDeConnexion(["google.com", "password"]))).toBe(
      "Google et mot de passe",
    );
  });
  it("un renvoi par minute", () => {
    expect(attenteRenvoi(1000, 1000 + 59_000)).toBe(1);
    expect(attenteRenvoi(1000, 1000 + 60_000)).toBe(0);
    expect(attenteRenvoi(undefined, 5)).toBe(0);
  });
});

describe("nettoyage des comptes non vérifiés", () => {
  const JOUR = 86_400_000;
  const maintenant = Date.UTC(2026, 10, 20);
  const u = (uid, { verifie = false, fournisseurs = ["password"], age = 10 } = {}) => ({
    uid,
    emailVerified: verifie,
    providerData: fournisseurs.map((providerId) => ({ providerId })),
    metadata: { creationTime: new Date(maintenant - age * JOUR).toUTCString() },
  });
  const liste = [
    u("ancien"),
    u("recent", { age: 2 }),
    u("verifie", { verifie: true }),
    u("google", { fournisseurs: ["google.com"] }),
    u("mixte", { fournisseurs: ["password", "google.com"] }),
    u("sept", { age: 7 }),
  ];
  it("supprime un compte non vérifié de plus de 7 jours, conserve les autres", () => {
    expect(comptesAPurger(liste, maintenant).map((x) => x.uid)).toEqual(["ancien"]);
  });
  it("le runner parcourt les pages et supprime par lots", async () => {
    const supprimes = [];
    const auth = {
      listUsers: async (_n, jeton) =>
        jeton ? { users: [u("ancien2")], pageToken: undefined } : { users: liste, pageToken: "p2" },
      deleteUsers: async (uids) => (supprimes.push(...uids), { successCount: uids.length }),
    };
    expect(await nettoyerComptes(auth, maintenant)).toBe(2);
    expect(supprimes).toEqual(["ancien", "ancien2"]);
  });
});

describe("fonctions : email vérifié", () => {
  it("seul email_verified === true passe", () => {
    expect(emailVerifie({ token: { email_verified: true } })).toBe(true);
    expect(emailVerifie({ token: { email_verified: false } })).toBe(false);
    expect(emailVerifie({ token: {} })).toBe(false);
    expect(emailVerifie(undefined)).toBe(false);
  });
});
