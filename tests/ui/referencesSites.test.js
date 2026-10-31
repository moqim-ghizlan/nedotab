// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  referencesDe,
  remplacerReferences,
  rendreAvecSites,
  texteSansReferences,
  traduireReferences,
} from "../../src/ui/chat/referencesSites.js";

const SITES = {
  "id-1": {
    id: "id-1",
    titre: "Marmiton",
    url: "https://www.marmiton.org/recettes",
    chemin: ["Cuisine", "Recettes"],
    site: { id: "id-1", type: "site", titre: "Marmiton", url: "https://www.marmiton.org/recettes" },
  },
  "id-2": {
    id: "id-2",
    titre: "GitHub",
    url: "https://github.com",
    chemin: [],
    site: { id: "id-2", type: "site", titre: "GitHub", url: "https://github.com" },
  },
};
const trouver = (id) => SITES[id] ?? null;

const rendre = (texte, options = {}) => {
  const boite = document.createElement("div");
  boite.append(rendreAvecSites(texte, { trouver, ...options }));
  return boite;
};

describe("référencesSites : découpage du texte", () => {
  it("0, 1 et 3 références, en début et en fin de texte", () => {
    expect(referencesDe("aucune")).toEqual([]);
    expect(referencesDe("voir [[site:s1]]")).toEqual(["s1"]);
    expect(referencesDe("[[site:s1]] puis [[site:s2]] et [[site:s3]]")).toEqual(["s1", "s2", "s3"]);
    expect(remplacerReferences("[[site:a]]x[[site:b]]", (id) => `<${id}>`)).toBe("<a>x<b>");
  });

  it("une référence incomplète (flux) reste du texte", () => {
    expect(referencesDe("voir [[site:s1")).toEqual([]);
    expect(referencesDe("voir [[site:s1]")).toEqual([]);
    expect(rendre("voir [[site:s1").textContent.trim()).toBe("voir [[site:s1");
  });

  it("pas de conversion dans les blocs de code ni le code en ligne", () => {
    const texte = "```\n[[site:s1]]\n```\net `[[site:s2]]` mais [[site:s3]]";
    expect(referencesDe(texte)).toEqual(["s3"]);
    const b = rendre(texte);
    expect(b.querySelector("pre").textContent).toContain("[[site:s1]]");
    expect(b.querySelector("p code").textContent).toBe("[[site:s2]]");
    expect(b.querySelectorAll(".chat-site")).toHaveLength(1);
  });

  it("un bloc de code non fermé (flux) protège aussi la fin du texte", () => {
    expect(referencesDe("avant [[site:s1]]\n```\n[[site:s2]]")).toEqual(["s1"]);
  });

  it("code indenté : la référence reste telle qu'écrite", () => {
    const b = rendre("texte\n\n    [[site:id-1]]\n");
    expect(b.querySelector("pre").textContent).toContain("[[site:id-1]]");
    expect(b.querySelector(".chat-site")).toBeNull();
  });
});

describe("référencesSites : traduction avec la table de la réponse", () => {
  it("les identifiants courts deviennent les identifiants réels, l'inconnu devient ?", () => {
    expect(traduireReferences("a [[site:s1]] b [[site:s2]] c [[site:s9]]", { s1: "id-1", s2: "id-2" })).toBe(
      "a [[site:id-1]] b [[site:id-2]] c [[site:?]]",
    );
    expect(traduireReferences("[[site:s1]]", undefined)).toBe("[[site:?]]");
    expect(traduireReferences("[[site:id-1]]", {})).toBe("[[site:id-1]]");
  });

  it("l'historique renvoyé au serveur contient le titre, jamais l'identifiant", () => {
    expect(texteSansReferences("Voir [[site:id-1]] et [[site:zzz]]", trouver)).toBe(
      "Voir « Marmiton » et (site de la collection)",
    );
  });
});

describe("référencesSites : cartes", () => {
  it("carte cliquable : titre, domaine, chemin, lien vers l'adresse réelle", () => {
    const b = rendre("Essayez [[site:id-1]] pour cuisiner.");
    const carte = b.querySelector(".chat-site");
    expect(carte.dataset.site).toBe("id-1");
    expect(carte.querySelector(".chat-site-titre").textContent).toBe("Marmiton");
    expect(carte.querySelector(".chat-site-detail").textContent).toBe(
      "marmiton.org · Cuisine › Recettes",
    );
    expect(carte.querySelector("a").getAttribute("href")).toBe("https://www.marmiton.org/recettes");
    expect(b.querySelector("p").textContent).toMatch(/^Essayez .* pour cuisiner\.$/);
  });

  it("dans une liste Markdown, la carte reste dans son élément de liste", () => {
    const b = rendre("- [[site:id-1]] : recettes\n- [[site:id-2]] : code");
    const items = [...b.querySelectorAll("ul li")];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector(".chat-site-titre").textContent).toBe("Marmiton");
    expect(items[1].querySelector(".chat-site-titre").textContent).toBe("GitHub");
  });

  it("identifiant inconnu ou site supprimé : « (site introuvable) » sans lien", () => {
    for (const id of ["id-inconnu", "?", "s4"]) {
      const c = rendre(`voir [[site:${id}]]`).querySelector(".chat-site");
      expect(c.textContent).toBe("(site introuvable)");
      expect(c.querySelector("a")).toBeNull();
    }
  });

  it("pendant le flux, un identifiant court non traduit est un simple repère", () => {
    const c = rendre("voir [[site:s3]]", { fluxEnCours: true }).querySelector(".chat-site");
    expect(c.classList.contains("chat-site--attente")).toBe(true);
    expect(c.querySelector("a")).toBeNull();
  });

  it("bouton « Afficher dans la grille » appelle afficher avec l'identifiant réel", () => {
    const afficher = vi.fn();
    const b = rendre("[[site:id-2]]", { afficher });
    b.querySelector(".chat-site-grille").click();
    expect(afficher).toHaveBeenCalledWith("id-2");
    expect(rendre("[[site:id-2]]").querySelector(".chat-site-grille")).toBeNull();
  });

  it("une adresse qui n'est pas http(s) n'est jamais un lien", () => {
    const piege = { ...SITES["id-1"], url: "javascript:alert(1)" };
    const b = rendre("[[site:x]]", { trouver: () => piege });
    expect(b.querySelector("a")).toBeNull();
    expect(b.innerHTML).not.toMatch(/javascript:alert/);
  });
});

describe("référencesSites : aucune injection", () => {
  it("[[site:s1\"><img src=x onerror=alert(1)>]] reste du texte brut", () => {
    const attaque = '[[site:s1"><img src=x onerror=alert(1)>]]';
    expect(referencesDe(attaque)).toEqual([]);
    const b = rendre(attaque);
    expect(b.querySelector("img")).toBeNull();
    expect(b.querySelector(".chat-site")).toBeNull();
    expect(b.textContent).toContain("onerror=alert(1)");
  });

  it("un titre de site avec du HTML s'affiche comme texte", () => {
    const sale = { ...SITES["id-2"], titre: '<img src=x onerror=alert(1)><b>gras</b>' };
    const b = rendre("[[site:id-2]]", { trouver: () => sale });
    expect(b.querySelector("img")).toBeNull();
    expect(b.querySelector("b")).toBeNull();
    expect(b.querySelector(".chat-site-titre").textContent).toBe(sale.titre);
  });

  it("les caractères réservés au marquage écrits par le modèle sont retirés", () => {
    const b = rendre("a 0 [[site:id-1]]");
    expect(b.querySelectorAll(".chat-site")).toHaveLength(1);
    expect(b.textContent).not.toMatch(/[]/);
  });
});
