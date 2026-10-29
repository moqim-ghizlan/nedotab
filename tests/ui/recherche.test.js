import { beforeEach, describe, expect, it } from "vitest";
import { creerRecherche } from "../../src/ui/recherche.js";

const site = (id, titre, url, tags = [], description = "") => ({
  id,
  type: "site",
  titre,
  url,
  creeLe: 0,
  tags,
  description,
});

const GRILLE = [
  site("pix", "Pixlr", "https://pixlr.com", ["retouche photo", "dev"], "Éditeur en ligne"),
  site("gh", "GitHub", "https://github.com", ["dev", "git"]),
  site("ed", "Éditeur", "https://editeur.fr", [], "Un outil pour retoucher des photos"),
];

function monter() {
  document.body.replaceChildren();
  const store = { lire: () => ({ grille: GRILLE, reglages: {} }), abonner: () => {} };
  const { racine, champ } = creerRecherche(store, { ouvrirDossier: () => {} });
  document.body.append(racine);
  const taper = (texte) => {
    champ.value = texte;
    champ.dispatchEvent(new Event("input"));
  };
  const lignes = () => [...racine.querySelectorAll("li.resultat")];
  return { champ, taper, lignes, racine };
}

describe("barre de recherche : tags et description (V4.7)", () => {
  let m;
  beforeEach(() => {
    m = monter();
  });

  it("mot présent seulement dans un tag : trouvé, raison « tag : … » en évidence", () => {
    m.taper("retouche");
    const li = m.lignes().find((l) => l.textContent.includes("Pixlr"));
    const raison = li.querySelector(".resultat-raison");
    expect(raison.textContent).toBe("tag : retouche photo");
    expect(raison.querySelector("mark").textContent).toBe("retouche");
  });

  it("mot présent dans la description : extrait avec le mot en évidence", () => {
    m.taper("retoucher");
    const raison = m.lignes()[0].querySelector(".resultat-raison");
    expect(raison.textContent).toContain("retoucher des photos");
    expect(raison.querySelector("mark").textContent).toBe("retoucher");
  });

  it("pas de raison quand c'est le titre qui correspond", () => {
    m.taper("github");
    expect(m.lignes()[0].querySelector(".resultat-raison")).toBeNull();
  });

  it("« # » : tags proposés, le plus utilisé d'abord, sans recherche web", () => {
    m.taper("#");
    const lignes = m.lignes();
    expect(lignes.every((l) => l.classList.contains("resultat--tag"))).toBe(true);
    expect(lignes[0].textContent).toBe("#dev");
    expect(m.racine.querySelector(".resultat--web")).toBeNull();
  });

  it("clic sur un tag proposé : le filtre est appliqué", () => {
    m.taper("#");
    m.lignes()[0].click();
    expect(m.champ.value).toBe("#dev ");
    const titres = m.lignes().filter((l) => l.classList.contains("resultat--site"));
    expect(titres.map((l) => l.querySelector(".resultat-titre").textContent).sort()).toEqual([
      "GitHub",
      "Pixlr",
    ]);
  });

  it("autocomplétion après # : « #gi » propose « git »", () => {
    m.taper("#gi");
    expect(
      m.lignes().some((l) => l.classList.contains("resultat--tag") && l.textContent === "#git"),
    ).toBe(true);
  });
});
