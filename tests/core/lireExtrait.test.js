import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lireExtrait, viderCacheExtraits } from "../../src/platform/extrait.js";

const html =
  "<html lang='fr'><head><title>Un site</title></head><body><p>Un texte assez long ici</p></body></html>";
const permis = { contient: async () => true };

beforeEach(() => {
  viderCacheExtraits();
  globalThis.DOMParser = new Window().DOMParser;
});

describe("lireExtrait", () => {
  it("sans permission : null, rien n'est téléchargé", async () => {
    const lirePage = vi.fn();
    const r = await lireExtrait("https://exemple.com/", {
      lirePage,
      permissions: { contient: async () => false },
    });
    expect(r).toBeNull();
    expect(lirePage).not.toHaveBeenCalled();
  });
  it("adresse privée ou sensible : extrait réduit, rien n'est téléchargé", async () => {
    const lirePage = vi.fn();
    for (const u of ["http://192.168.1.1/", "https://www.mabanque.fr/"]) {
      const r = await lireExtrait(u, { lirePage, permissions: permis });
      expect(r.reduit).toBe(true);
    }
    expect(lirePage).not.toHaveBeenCalled();
  });
  it("jeton dans l'URL : requête retirée de l'URL transmise", async () => {
    const r = await lireExtrait("https://exemple.com/a?token=x", {
      lirePage: vi.fn(),
      permissions: permis,
    });
    expect(r.url).toBe("https://exemple.com/a");
  });
  it("cache : la page n'est téléchargée qu'une fois", async () => {
    const lirePage = vi.fn(async () => ({ html, urlFinale: "https://exemple.com/" }));
    const a = await lireExtrait("https://exemple.com/", { lirePage, permissions: permis });
    const b = await lireExtrait("https://exemple.com/", { lirePage, permissions: permis });
    expect(a.texte).toContain("Un texte assez long");
    expect(b).toBe(a);
    expect(lirePage).toHaveBeenCalledTimes(1);
  });
  it("cache : expire après 10 minutes", async () => {
    vi.useFakeTimers();
    try {
      const lirePage = vi.fn(async () => ({ html, urlFinale: "https://exemple.com/" }));
      await lireExtrait("https://exemple.com/", { lirePage, permissions: permis });
      vi.advanceTimersByTime(11 * 60 * 1000);
      await lireExtrait("https://exemple.com/", { lirePage, permissions: permis });
      expect(lirePage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("cache : 50 entrées au plus", async () => {
    const lirePage = vi.fn(async (u) => ({ html, urlFinale: u }));
    for (let i = 0; i < 55; i++)
      await lireExtrait(`https://exemple.com/${i}`, { lirePage, permissions: permis });
    await lireExtrait("https://exemple.com/0", { lirePage, permissions: permis });
    expect(lirePage).toHaveBeenCalledTimes(56);
  });
  it("page illisible : null", async () => {
    expect(
      await lireExtrait("https://exemple.com/", {
        lirePage: async () => null,
        permissions: permis,
      }),
    ).toBeNull();
  });
});
