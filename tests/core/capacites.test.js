import { describe, expect, it } from "vitest";
import * as extension from "../../src/platform/extension.js";
import * as pwa from "../../src/platform/pwa.js";

describe("capacités des plateformes", () => {
  it("les deux plateformes déclarent les mêmes capacités et les mêmes fonctions", () => {
    expect(Object.keys(pwa.capacites).sort()).toEqual(Object.keys(extension.capacites).sort());
    // estMobile is a helper of the web app only.
    expect(
      Object.keys(pwa)
        .filter((k) => k !== "estMobile")
        .sort(),
    ).toEqual(Object.keys(extension).sort());
  });

  it("l'application web ne lit pas les autres sites et n'a pas de permission à demander", async () => {
    expect(pwa.capacites).toMatchObject({
      nom: "pwa",
      lirePagesWeb: false,
      permissionsSites: false,
      barreAdresse: false,
    });
    expect(await pwa.lirePage("https://exemple.fr")).toBeNull();
    expect(pwa.urlFaviconNavigateur("https://exemple.fr")).toBeNull();
    expect(await pwa.permissionsSites.contient()).toBe(false);
  });

  it("ni l'extension ni l'application ouverte dans un onglet ne sont « installées »", () => {
    expect(extension.estInstallee()).toBe(false);
    expect(extension.capacites.installable).toBe(false);
    expect(pwa.capacites.installable).toBe(true);
    expect(pwa.estInstallee()).toBe(false);
  });

  it("téléphone et tablette, y compris l'iPad qui se présente comme un Mac", () => {
    const ipad = {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 5,
    };
    const mac = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 };
    expect(pwa.estMobile(ipad)).toBe(true);
    expect(pwa.estMobile({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" })).toBe(true);
    expect(pwa.estMobile(mac)).toBe(false);
    expect(pwa.estMobile({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
  });
});
