import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Les dialogues natifs (<dialog>) ne sont pas fiables dans happy-dom : on les remplace.
const demander = vi.fn();
vi.mock("../../src/ui/dialogues/commun.js", () => ({ demander: (...a) => demander(...a) }));
vi.mock("../../src/ui/toast.js", () => ({ toast: vi.fn() }));

import { sectionVpn } from "../../src/ui/reglages/vpn.js";
import { LIBELLE_RESERVE } from "../../src/core/vpn.js";

const ACCES = {
  domaine: "vpn.exemple.org",
  port: 443,
  compte: "u_abcdefghij",
  motDePasse: "MotDePasseTresSecret0123456789abcd",
  pays: "Allemagne",
};

function faux({ admin = false, acces = { ok: true, valeur: ACCES }, invites = [] } = {}) {
  return {
    estAdmin: vi.fn(async () => admin),
    acces: vi.fn(async () => acces),
    regenerer: vi.fn(async () => ({ ok: true, valeur: { ...ACCES, motDePasse: "NouveauMotDePasse0123456789abcdefg" } })),
    inviter: vi.fn(async () => ({ ok: true, valeur: { statut: "en_attente" } })),
    revoquer: vi.fn(async () => ({ ok: true, valeur: { ok: true } })),
    invites: vi.fn(async () => ({ ok: true, valeur: { invites } })),
  };
}
const refuse = { ok: false, code: "functions/permission-denied", erreur: LIBELLE_RESERVE };

/** Opens a sub-tab of the section (the panels are built one at a time). */
function onglet(nom) {
  [...document.querySelectorAll(".vpn-onglet")].find((b) => b.textContent === nom)?.click();
}

async function monter(service, { ouvrir = "Mon accès" } = {}) {
  const v = sectionVpn({ service });
  document.body.append(v.section);
  await v.charger();
  if (ouvrir) onglet(ouvrir);
  return v;
}
const texte = () => document.body.textContent;
const bouton = (libelle) => [...document.querySelectorAll("button")].find((b) => b.textContent === libelle);

beforeEach(() => demander.mockReset());
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("réglages VPN — non invité", () => {
  it("ne voit qu'une phrase, sans serveur, sans identifiants ni liste", async () => {
    await monter(faux({ acces: refuse }));
    expect(texte()).toContain(LIBELLE_RESERVE);
    expect(texte()).not.toMatch(/vpn\.exemple\.org|Invités|Afficher mes identifiants|u_/);
    expect(bouton("Inviter")).toBeUndefined();
  });
});

describe("réglages VPN — invité", () => {
  it("« Accès accordé », mot de passe caché tant qu'on ne le demande pas", async () => {
    await monter(faux());
    expect(texte()).toContain("Accès accordé");
    expect(texte()).not.toContain(ACCES.motDePasse);
    expect(texte()).not.toContain(ACCES.compte);
    expect(bouton("Inviter")).toBeUndefined();
  });

  it("« Afficher mes identifiants » montre tout, « Masquer » le cache", async () => {
    await monter(faux());
    bouton("Afficher mes identifiants").click();
    expect(texte()).toContain("vpn.exemple.org:443");
    expect(texte()).toContain("Allemagne");
    expect(texte()).toContain(ACCES.compte);
    expect(texte()).toContain(ACCES.motDePasse);
    bouton("Masquer").click();
    expect(texte()).not.toContain(ACCES.motDePasse);
  });

  it("le mot de passe se masque seul après une minute", async () => {
    vi.useFakeTimers();
    await monter(faux());
    bouton("Afficher mes identifiants").click();
    expect(texte()).toContain(ACCES.motDePasse);
    vi.advanceTimersByTime(60_001);
    expect(texte()).not.toContain(ACCES.motDePasse);
  });

  it("un nouveau mot de passe remplace l'ancien après confirmation", async () => {
    const service = faux();
    await monter(service);
    bouton("Afficher mes identifiants").click();
    demander.mockResolvedValue(true);
    bouton("Nouveau mot de passe").click();
    await vi.waitFor(() => expect(texte()).toContain("NouveauMotDePasse0123456789abcdefg"));
    expect(texte()).not.toContain(ACCES.motDePasse);
    expect(service.regenerer).toHaveBeenCalledOnce();
  });

  it("pendant la génération, un message s'affiche tout de suite puis le nouveau mot de passe", async () => {
    const service = faux();
    let finir;
    service.regenerer = vi.fn(
      () => new Promise((resolve) => (finir = () => resolve({ ok: true, valeur: { ...ACCES, motDePasse: "NouveauMotDePasse0123456789abcdefg" } }))),
    );
    await monter(service);
    bouton("Afficher mes identifiants").click();
    demander.mockResolvedValue(true);
    bouton("Nouveau mot de passe").click();
    await vi.waitFor(() => expect(texte()).toContain("Génération du nouveau mot de passe"));
    expect(texte()).not.toContain(ACCES.motDePasse);
    finir();
    await vi.waitFor(() => expect(texte()).toContain("NouveauMotDePasse0123456789abcdefg"));
    expect(texte()).not.toContain("Génération du nouveau mot de passe");
  });

  it("une erreur pendant la génération rétablit l'écran", async () => {
    const service = faux();
    service.regenerer = vi.fn(async () => ({ ok: false, code: "functions/unavailable", erreur: "Service indisponible." }));
    await monter(service);
    bouton("Afficher mes identifiants").click();
    demander.mockResolvedValue(true);
    bouton("Nouveau mot de passe").click();
    await vi.waitFor(() => expect(service.regenerer).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(bouton("Afficher mes identifiants")).toBeDefined());
    expect(texte()).not.toContain("Génération du nouveau mot de passe");
  });

  it("refuser la confirmation ne change rien", async () => {
    const service = faux();
    await monter(service);
    bouton("Afficher mes identifiants").click();
    demander.mockResolvedValue(false);
    bouton("Nouveau mot de passe").click();
    await Promise.resolve();
    expect(service.regenerer).not.toHaveBeenCalled();
  });

  it("le mot de passe n'est écrit nulle part dans la page (pas d'attribut, pas de stockage)", async () => {
    await monter(faux());
    bouton("Afficher mes identifiants").click();
    expect(document.body.innerHTML.split(ACCES.motDePasse).length - 1).toBe(1); // une fois, en texte
    expect(JSON.stringify({ ...localStorage })).not.toContain(ACCES.motDePasse);
  });

  it("une erreur du service s'affiche avec « Réessayer »", async () => {
    await monter(faux({ acces: { ok: false, code: "functions/unavailable", erreur: "Service indisponible : vérifiez votre connexion." } }));
    expect(texte()).toContain("Service indisponible");
    expect(bouton("Réessayer")).toBeDefined();
  });
});

describe("réglages VPN — propriétaire", () => {
  const invites = [
    { email: "a@ex.org", statut: "acceptee", acces: true, invitationLe: 2 },
    { email: "b@ex.org", statut: "en_attente", acces: false, invitationLe: 1 },
    { email: "c@ex.org", statut: "revoquee", acces: false, invitationLe: 0 },
  ];

  it("voit la liste (sans les accès retirés), l'avertissement et son propre état", async () => {
    await monter(faux({ admin: true, acces: refuse, invites }), { ouvrir: "Administration" });
    expect(texte()).toContain("a@ex.org");
    expect(texte()).toContain("b@ex.org");
    expect(texte()).not.toContain("c@ex.org");
    expect(texte()).toContain("Accès accordé");
    expect(texte()).toContain("En attente de connexion");
    expect(texte()).toContain("N'invitez que des personnes de confiance");
    onglet("Mon accès");
    expect(texte()).toContain("invitez votre propre adresse");
  });

  it("inviter envoie l'adresse normalisée et recharge la liste", async () => {
    const service = faux({ admin: true, acces: refuse, invites });
    await monter(service, { ouvrir: "Administration" });
    const champ = document.querySelector("#vpn-email");
    champ.value = "  Nouveau@Ex.ORG ";
    bouton("Inviter").click();
    await vi.waitFor(() => expect(service.inviter).toHaveBeenCalledWith("nouveau@ex.org"));
    await vi.waitFor(() => expect(service.invites).toHaveBeenCalledTimes(2));
    expect(champ.value).toBe("");
  });

  it("s'inviter soi-même : « Mon accès » est relu et affiche l'accès accordé", async () => {
    const service = faux({ admin: true, acces: refuse, invites });
    await monter(service);
    expect(texte()).toContain("invitez votre propre adresse");
    onglet("Administration");
    service.acces.mockResolvedValue({ ok: true, valeur: ACCES });
    document.querySelector("#vpn-email").value = "moi@ex.org";
    bouton("Inviter").click();
    await vi.waitFor(() => expect(service.acces).toHaveBeenCalledTimes(2));
    onglet("Mon accès");
    await vi.waitFor(() => expect(bouton("Afficher mes identifiants")).toBeDefined());
    expect(texte()).not.toContain("invitez votre propre adresse");
    expect(texte()).not.toContain(ACCES.motDePasse);
  });

  it("se retirer soi-même : « Mon accès » est relu et redevient réservé", async () => {
    const service = faux({ admin: true, invites });
    await monter(service);
    expect(bouton("Afficher mes identifiants")).toBeDefined();
    onglet("Administration");
    service.acces.mockResolvedValue(refuse);
    demander.mockResolvedValue(true);
    document.querySelector('button[aria-label="Retirer l\'accès de a@ex.org"]').click();
    await vi.waitFor(() => expect(service.acces).toHaveBeenCalledTimes(2));
    onglet("Mon accès");
    await vi.waitFor(() => expect(bouton("Afficher mes identifiants")).toBeUndefined());
    expect(texte()).toContain(LIBELLE_RESERVE);
  });

  it("une adresse invalide n'appelle pas le serveur", async () => {
    const service = faux({ admin: true, acces: refuse });
    await monter(service, { ouvrir: "Administration" });
    document.querySelector("#vpn-email").value = "pas-un-email";
    bouton("Inviter").click();
    await Promise.resolve();
    expect(service.inviter).not.toHaveBeenCalled();
  });

  it("retirer l'accès demande confirmation, puis révoque", async () => {
    const service = faux({ admin: true, acces: refuse, invites });
    await monter(service, { ouvrir: "Administration" });
    demander.mockResolvedValue(true);
    document.querySelector('button[aria-label="Retirer l\'accès de a@ex.org"]').click();
    await vi.waitFor(() => expect(service.revoquer).toHaveBeenCalledWith("a@ex.org"));
  });

  it("annuler la confirmation ne révoque rien", async () => {
    const service = faux({ admin: true, acces: refuse, invites });
    await monter(service, { ouvrir: "Administration" });
    demander.mockResolvedValue(false);
    document.querySelector('button[aria-label="Retirer l\'accès de a@ex.org"]').click();
    await Promise.resolve();
    expect(service.revoquer).not.toHaveBeenCalled();
  });

  it("un non-administrateur n'a pas le formulaire, même si le service l'appelle", async () => {
    const service = faux({ admin: false, acces: refuse });
    await monter(service);
    expect(service.invites).not.toHaveBeenCalled();
    expect(document.querySelector("#vpn-email")).toBeNull();
  });
});
