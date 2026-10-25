import { describe, expect, it, vi } from "vitest";
import { creerIndicateur, POINTS_MAX } from "../../src/ui/pages/indicateur.js";

const monter = () => {
  const allerA = vi.fn();
  const indicateur = creerIndicateur({ allerA });
  document.body.replaceChildren(indicateur.racine);
  return { ...indicateur, allerA };
};
const points = (racine) => racine.querySelectorAll("button.indicateur-point");
const masque = (racine) => racine.classList.contains("indicateur-pages--masque");

describe("indicateur de pages", () => {
  it("masqué pour une seule page", () => {
    const { racine, maj } = monter();
    maj(0, 1);
    expect(masque(racine)).toBe(true);
  });

  it("2 à 10 pages : un point par page, l'actif marqué, cliquable", () => {
    const { racine, maj, allerA } = monter();
    for (const nb of [2, POINTS_MAX]) {
      maj(1, nb);
      expect(masque(racine)).toBe(false);
      expect(points(racine)).toHaveLength(nb);
      const actifs = racine.querySelectorAll("[aria-current='page']");
      expect(actifs).toHaveLength(1);
      expect(actifs[0].getAttribute("aria-label")).toBe(`Page 2 sur ${nb}`);
    }
    points(racine)[3].click();
    expect(allerA).toHaveBeenCalledWith(3);
  });

  it("au-delà de 10 pages : version compacte « ‹ 3 / 14 › »", () => {
    const { racine, maj, allerA } = monter();
    maj(2, 14);
    expect(points(racine)).toHaveLength(0);
    expect(racine.querySelector(".indicateur-compte").textContent).toBe("3 / 14");
    racine.querySelectorAll(".indicateur-fleche")[1].click();
    expect(allerA).toHaveBeenCalledWith(3);
  });

  it("pendant un glisser : un point de plus pour la page vide temporaire", () => {
    const { racine, maj } = monter();
    maj(0, 1, { temporaire: true });
    expect(masque(racine)).toBe(false);
    expect(racine.querySelectorAll(".indicateur-point--temporaire")).toHaveLength(1);
  });
});
