import { describe, expect, it } from "vitest";
import {
  adresseProxy,
  libelleInvite,
  LIBELLE_RESERVE,
  lireAcces,
  messageErreurVpn,
} from "../../src/core/vpn.js";

describe("messages d'erreur", () => {
  it("un non-invité lit une seule phrase, sans détail sur le serveur", () => {
    const m = messageErreurVpn({ code: "functions/permission-denied" });
    expect(m).toBe(LIBELLE_RESERVE);
  });
  it("les autres codes ont un texte en français, un code inconnu aussi", () => {
    expect(messageErreurVpn({ code: "functions/resource-exhausted" })).toMatch(/demain/);
    expect(messageErreurVpn({ code: "functions/unavailable" })).toMatch(/connexion/);
    expect(messageErreurVpn({ code: "autre" })).toBe("Le VPN est indisponible pour l'instant.");
    expect(messageErreurVpn(undefined)).toBe("Le VPN est indisponible pour l'instant.");
  });
});

describe("libelleInvite", () => {
  it("décrit l'état d'une invitation", () => {
    expect(libelleInvite({ statut: "en_attente", acces: false })).toBe("En attente de connexion");
    expect(libelleInvite({ statut: "acceptee", acces: true })).toBe("Accès accordé");
    expect(libelleInvite({ statut: "revoquee", acces: false })).toBe("Accès retiré");
    // Acceptée mais l'accès n'existe plus (compte supprimé) : affichée comme retirée.
    expect(libelleInvite({ statut: "acceptee", acces: false })).toBe("Accès retiré");
  });
});

describe("lireAcces", () => {
  const complet = { domaine: "vpn.ex.org", port: 443, compte: "u_abc", motDePasse: "mdp", pays: "Allemagne" };
  it("garde seulement ce que l'écran montre", () => {
    expect(lireAcces({ ...complet, empreinte: "$2y$secret", extra: 1 })).toEqual(complet);
  });
  it("port absent : 443 ; pays absent : null", () => {
    expect(lireAcces({ ...complet, port: undefined, pays: undefined })).toMatchObject({
      port: 443,
      pays: null,
    });
  });
  it("une réponse incomplète ou absente ne montre rien", () => {
    expect(lireAcces(null)).toBeNull();
    expect(lireAcces({ ...complet, motDePasse: "" })).toBeNull();
    expect(lireAcces({ ...complet, compte: 5 })).toBeNull();
  });
});

describe("adresseProxy", () => {
  it("domaine:port, 443 par défaut", () => {
    expect(adresseProxy({ domaine: "vpn.ex.org", port: 8443 })).toBe("vpn.ex.org:8443");
    expect(adresseProxy({ domaine: "vpn.ex.org" })).toBe("vpn.ex.org:443");
  });
});
