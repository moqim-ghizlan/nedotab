import { afterEach, describe, expect, it, vi } from "vitest";
import { creerAttenteVerification, creerFormulaireConnexion } from "../../src/ui/connexion.js";
import { creerCompte } from "../../src/ui/services/compte.js";

afterEach(() => document.body.replaceChildren());

const soumettre = async (form) => {
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
};

describe("formulaire de connexion (V4.23)", () => {
  function monter(extra = {}) {
    const connecterEmail = vi.fn(async () => ({ ok: true }));
    const reinitialiser = vi.fn(async () => ({ ok: true }));
    const form = creerFormulaireConnexion({ connecterEmail, reinitialiser, ...extra });
    document.body.append(form);
    return { form, connecterEmail, reinitialiser };
  }
  const remplir = (email, mdp) => {
    document.querySelector("#connexion-email").value = email;
    document.querySelector("#connexion-mdp").value = mdp;
  };

  it("champs accessibles : vrais labels et valeurs autocomplete pour le gestionnaire de mots de passe", () => {
    monter();
    const e = document.querySelector("#connexion-email");
    const m = document.querySelector("#connexion-mdp");
    expect(e.type).toBe("email");
    expect(e.autocomplete).toBe("email");
    expect(m.autocomplete).toBe("current-password");
    expect(document.querySelector("label[for=connexion-email]")).not.toBeNull();
    expect(document.querySelector("label[for=connexion-mdp]")).not.toBeNull();
  });
  it("bascule vers « Créer un compte » : new-password et message d'aide", () => {
    monter();
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Créer un compte").click();
    expect(document.querySelector("#connexion-mdp").autocomplete).toBe("new-password");
    expect(document.body.textContent).toContain("10 caractères");
  });
  it("l'œil affiche puis masque le mot de passe", () => {
    monter();
    const oeil = document.querySelector(".connexion-oeil");
    oeil.click();
    expect(document.querySelector("#connexion-mdp").type).toBe("text");
    oeil.click();
    expect(document.querySelector("#connexion-mdp").type).toBe("password");
  });
  it("e-mail invalide : erreur annoncée, aucun appel", async () => {
    const { form, connecterEmail } = monter();
    remplir("pasunemail", "motdepasse-long");
    await soumettre(form);
    expect(connecterEmail).not.toHaveBeenCalled();
    expect(document.querySelector("[role=alert]:not([hidden])")).not.toBeNull();
  });
  it("mot de passe trop court à la création : refusé avant l'appel", async () => {
    const { form, connecterEmail } = monter();
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Créer un compte").click();
    remplir("a@exemple.fr", "court");
    await soumettre(form);
    expect(connecterEmail).not.toHaveBeenCalled();
  });
  it("connexion : appel avec les valeurs, champ mot de passe vidé ensuite", async () => {
    const { form, connecterEmail } = monter();
    remplir("a@exemple.fr", "motdepasse-long");
    await soumettre(form);
    expect(connecterEmail).toHaveBeenCalledWith("a@exemple.fr", "motdepasse-long", { creer: false });
    expect(document.querySelector("#connexion-mdp").value).toBe("");
  });
  it("hors ligne : « Connexion internet nécessaire », aucun appel", async () => {
    const { form, connecterEmail } = monter({ horsLigne: () => true });
    remplir("a@exemple.fr", "motdepasse-long");
    await soumettre(form);
    expect(connecterEmail).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Connexion internet nécessaire");
  });
  it("erreur du serveur affichée sous le champ", async () => {
    const { form } = monter({ connecterEmail: async () => ({ ok: false, erreur: "Adresse e-mail ou mot de passe incorrect." }) });
    remplir("a@exemple.fr", "motdepasse-long");
    await soumettre(form);
    expect(document.body.textContent).toContain("incorrect");
  });
  it("mot de passe oublié : vue dédiée, même message que le compte existe ou non", async () => {
    const { form, reinitialiser } = monter();
    document.querySelector("#connexion-email").value = "inconnu@exemple.fr";
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Mot de passe oublié ?").click();
    // L'adresse déjà saisie est reprise dans la vue « mot de passe oublié ».
    expect(document.querySelector("#connexion-email-oubli").value).toBe("inconnu@exemple.fr");
    await soumettre(form);
    expect(reinitialiser).toHaveBeenCalledWith("inconnu@exemple.fr");
    expect(document.body.textContent).toContain("Si un compte existe");
  });
  it("mot de passe oublié : adresse invalide, aucun appel", async () => {
    const { form, reinitialiser } = monter();
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Mot de passe oublié ?").click();
    document.querySelector("#connexion-email-oubli").value = "pasunemail";
    await soumettre(form);
    expect(reinitialiser).not.toHaveBeenCalled();
  });
  it("création : les deux mots de passe doivent être identiques", async () => {
    const { form, connecterEmail } = monter();
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Créer un compte").click();
    remplir("a@exemple.fr", "motdepasse-long");
    document.querySelector("#connexion-mdp2").value = "autre-mot-de-passe";
    await soumettre(form);
    expect(connecterEmail).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("ne sont pas identiques");
    document.querySelector("#connexion-mdp2").value = "motdepasse-long";
    await soumettre(form);
    expect(connecterEmail).toHaveBeenCalledWith("a@exemple.fr", "motdepasse-long", { creer: true });
  });
  it("le bouton Google est affiché sous le formulaire", () => {
    const g = document.createElement("button");
    g.className = "bouton-google";
    monter({ boutonGoogle: g });
    expect(document.querySelector(".connexion-alternatives .bouton-google")).toBe(g);
  });
});

describe("« Vérifiez votre boîte mail »", () => {
  it("renvoi limité à un par minute, « J'ai vérifié » rappelle le service", async () => {
    let t = 1_000_000;
    const renvoyer = vi.fn(async () => ({ ok: true }));
    const jaiVerifie = vi.fn(async () => false);
    document.body.append(
      creerAttenteVerification({
        email: "a@exemple.fr",
        jaiVerifie,
        renvoyer,
        deconnecter: vi.fn(),
        maintenant: () => t,
      }),
    );
    const bouton = (texte) => [...document.querySelectorAll("button")].find((b) => b.textContent === texte);
    bouton("Renvoyer l'e-mail").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(renvoyer).not.toHaveBeenCalled(); // l'e-mail vient de partir
    t += 61_000;
    bouton("Renvoyer l'e-mail").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(renvoyer).toHaveBeenCalledTimes(1);
    bouton("J'ai vérifié").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(jaiVerifie).toHaveBeenCalled();
    expect(document.body.textContent).toContain("pas encore vérifiée");
  });
});

describe("service de compte : adresse non vérifiée", () => {
  const plat = () => {
    const m = new Map();
    return {
      capacites: { connexion: "jeton" },
      preferences: { lire: async (c) => m.get(c) ?? null, ecrire: async (c, v) => void m.set(c, v) },
      ConnexionAnnulee: class extends Error {},
      ConnexionIndisponible: class extends Error {},
      obtenirJetonGoogle: async () => null,
      oublierJetonGoogle: async () => {},
    };
  };
  it("inscription : statut « verification », jamais « connecte », aucun indicateur écrit", async () => {
    const p = plat();
    const fb = {
      inscrireEmail: async () => ({ uid: "u", email: "a@b.fr", emailVerifie: false }),
      ecouterUtilisateur: () => () => {},
    };
    const compte = creerCompte({ charger: async () => fb, plat: p });
    const r = await compte.inscrire("a@b.fr", "motdepasse-long");
    expect(r).toEqual({ ok: true, verifie: false });
    expect(compte.lire().statut).toBe("verification");
    expect(await p.preferences.lire("compte")).toBeNull();
  });
  it("« J'ai vérifié » : passe à « connecte »", async () => {
    const p = plat();
    const fb = {
      inscrireEmail: async () => ({ uid: "u", email: "a@b.fr", emailVerifie: false }),
      actualiserVerification: async () => ({ uid: "u", email: "a@b.fr", emailVerifie: true }),
      ecouterUtilisateur: () => () => {},
    };
    const compte = creerCompte({ charger: async () => fb, plat: p });
    await compte.inscrire("a@b.fr", "motdepasse-long");
    expect(await compte.actualiserVerification()).toBe(true);
    expect(compte.lire().statut).toBe("connecte");
  });
  it("erreur de connexion : message générique, retour à « deconnecte »", async () => {
    const fb = {
      connecterEmail: async () => {
        throw Object.assign(new Error("x"), { code: "auth/invalid-credential" });
      },
      ecouterUtilisateur: () => () => {},
    };
    const compte = creerCompte({ charger: async () => fb, plat: plat() });
    const r = await compte.connecterEmail("a@b.fr", "mauvais-mot-de-passe");
    expect(r).toEqual({ ok: false, erreur: "Adresse e-mail ou mot de passe incorrect." });
    expect(compte.lire().statut).toBe("deconnecte");
  });
});
