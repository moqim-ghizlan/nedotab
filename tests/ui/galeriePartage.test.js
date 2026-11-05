import { afterEach, describe, expect, it, vi } from "vitest";
import { creerGalerie } from "../../src/ui/galeriePartage.js";

afterEach(() => document.body.replaceChildren());

function monter() {
  const items = [
    { id: "a", type: "texte", contenu: "bonjour", titre: "bonjour", creeLe: Date.now() },
    { id: "b", type: "texte", contenu: "salut", titre: "salut", creeLe: Date.now() },
  ];
  const api = {
    vues: () => items,
    abonner: () => () => {},
    urlApercu: vi.fn(async () => null),
    deverrouiller: vi.fn(),
    actions: () => [],
    lot: { supprimer: vi.fn(), prolonger: vi.fn(), telecharger: vi.fn() },
    ecart: () => 0,
    appareil: (i) => i.appareil ?? "",
  };
  return creerGalerie(api);
}
const bouton = () => document.querySelector(".pgal-entete .pgal-bouton:last-child");

describe("galerie : le ✕ ferme un seul niveau", () => {
  it("ferme l'aperçu puis la galerie", () => {
    const g = monter();
    g.ouvrir("a");
    expect(bouton().title).toContain("aperçu");
    bouton().click();
    expect(g.estOuverte()).toBe(true);
    expect(document.querySelector(".pgal-visionneuse").hidden).toBe(true);
    expect(bouton().title).toContain("galerie");
    bouton().click();
    expect(g.estOuverte()).toBe(false);
  });

  it("Échap se comporte pareil", () => {
    const g = monter();
    g.ouvrir("a");
    const echap = () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    echap();
    expect(g.estOuverte()).toBe(true);
    echap();
    expect(g.estOuverte()).toBe(false);
  });
});
