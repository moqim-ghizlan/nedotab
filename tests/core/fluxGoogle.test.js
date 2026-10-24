import { describe, expect, it } from "vitest";
import {
  creerNonce,
  estGoogleChrome,
  FluxAnnule,
  lireReponse,
  urlAutorisation,
} from "../../src/platform/fluxGoogle.js";

const REDIRECTION = "https://imegmpimokhlnlhcmaogimnlgcfgefnn.chromiumapp.org/";
const b64url = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const jwt = (charge) => `${b64url({ alg: "RS256" })}.${b64url(charge)}.signature`;

describe("navigateur : Google Chrome ou autre", () => {
  it("Google Chrome reconnu par ses marques", () => {
    expect(
      estGoogleChrome({
        userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Google Chrome" }] },
      }),
    ).toBe(true);
  });
  it("Brave, Edge, Opera : pas Google Chrome", () => {
    expect(
      estGoogleChrome({ brave: {}, userAgentData: { brands: [{ brand: "Google Chrome" }] } }),
    ).toBe(false);
    expect(
      estGoogleChrome({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Brave" }] } }),
    ).toBe(false);
    expect(estGoogleChrome({ userAgentData: { brands: [{ brand: "Microsoft Edge" }] } })).toBe(
      false,
    );
    expect(estGoogleChrome({ userAgent: "Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0" })).toBe(
      false,
    );
    expect(estGoogleChrome({ userAgent: "Mozilla/5.0 Chrome/130.0 Safari/537.36 OPR/115" })).toBe(
      false,
    );
  });
});

describe("connexion par fenêtre Google", () => {
  it("URL : client web, redirection de l'extension, jeton d'identité seul, nonce", () => {
    const url = new URL(
      urlAutorisation({ clientId: "c.apps", redirection: REDIRECTION, nonce: "n1" }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "c.apps",
      redirect_uri: REDIRECTION,
      response_type: "id_token",
      scope: "openid email profile",
      nonce: "n1",
      prompt: "select_account",
    });
  });
  it("nonce : 32 caractères hexadécimaux, différent à chaque fois", () => {
    expect(creerNonce()).toMatch(/^[0-9a-f]{32}$/);
    expect(creerNonce()).not.toBe(creerNonce());
  });
  it("réponse valide : jeton rendu", () => {
    const idToken = jwt({ nonce: "n1", email: "é@x.fr" });
    expect(lireReponse(`${REDIRECTION}#id_token=${idToken}&authuser=0`, "n1")).toEqual({ idToken });
  });
  it("nonce différent : refusé", () => {
    const idToken = jwt({ nonce: "autre" });
    expect(() => lireReponse(`${REDIRECTION}#id_token=${idToken}`, "n1")).toThrow(/inattendue/);
  });
  it("refus de l'utilisateur : annulation (pas une erreur affichée)", () => {
    expect(() => lireReponse(`${REDIRECTION}#error=access_denied`, "n1")).toThrow(FluxAnnule);
  });
  it("autre erreur ou jeton absent : erreur", () => {
    expect(() => lireReponse(`${REDIRECTION}#error=invalid_request`, "n1")).toThrow(
      /invalid_request/,
    );
    expect(() => lireReponse(`${REDIRECTION}#state=x`, "n1")).toThrow(/Aucun jeton/);
  });
});
