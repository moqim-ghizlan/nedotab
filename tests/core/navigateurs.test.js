import { describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { migrer } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";
import { urlPourNavigateur } from "../../src/core/navigateurs.js";

describe("navigateur qui ouvre les sites sur iOS", () => {
  const url = "https://exemple.fr/page?q=a b&x=1#haut";

  it("Safari et un choix inconnu gardent l'adresse", () => {
    expect(urlPourNavigateur(url, "safari")).toBe(url);
    expect(urlPourNavigateur(url, undefined)).toBe(url);
    expect(urlPourNavigateur(url, "opera")).toBe(url);
  });

  it("Chrome et Edge remplacent le schéma, http comme https", () => {
    expect(urlPourNavigateur("https://exemple.fr/a?b=1", "chrome")).toBe(
      "googlechromes://exemple.fr/a?b=1",
    );
    expect(urlPourNavigateur("http://exemple.fr/", "chrome")).toBe("googlechrome://exemple.fr/");
    expect(urlPourNavigateur("HTTPS://exemple.fr/", "edge")).toBe(
      "microsoft-edge-https://exemple.fr/",
    );
    expect(urlPourNavigateur("http://exemple.fr/", "edge")).toBe(
      "microsoft-edge-http://exemple.fr/",
    );
  });

  it("Firefox et Brave reçoivent l'adresse entière encodée", () => {
    expect(urlPourNavigateur(url, "firefox")).toBe(
      `firefox://open-url?url=${encodeURIComponent(url)}`,
    );
    expect(urlPourNavigateur(url, "brave")).toBe(`brave://open-url?url=${encodeURIComponent(url)}`);
  });

  it("une adresse qui n'est pas web reste telle quelle", () => {
    expect(urlPourNavigateur("mailto:a@b.fr", "chrome")).toBe("mailto:a@b.fr");
    expect(urlPourNavigateur("", "firefox")).toBe("");
  });

  it("réglage propre à l'appareil, Safari par défaut et non stocké", () => {
    const modifier = (etat, changements) =>
      reduire(etat, { type: A.REGLAGES_MODIFIER, changements });
    let etat = modifier(etatInitial(), { navigateur: "chrome" });
    expect(etat.reglagesAppareil).toEqual({ navigateur: "chrome" });
    expect("navigateur" in etat.reglages).toBe(false);
    expect(modifier(etat, { navigateur: "opera" })).toBe(etat);
    etat = modifier(etat, { navigateur: "safari" });
    expect(etat.reglagesAppareil).toEqual({});
    const charge = (navigateur) =>
      migrer({ ...etatInitial(), reglagesAppareil: { navigateur } }).etat.reglagesAppareil;
    expect(charge("brave")).toEqual({ navigateur: "brave" });
    expect(charge("safari")).toEqual({});
    expect(charge(3)).toEqual({});
  });
});
