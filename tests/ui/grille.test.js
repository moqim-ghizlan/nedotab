import { describe, expect, it } from "vitest";
import { exemple } from "../../src/core/exemple.js";
import { creerSite } from "../../src/core/modele.js";
import { rendreGrille } from "../../src/ui/grille.js";

describe("rendreGrille", () => {
  it("crée autant de liens que de sites", () => {
    const ul = document.createElement("ul");
    rendreGrille(ul, exemple());
    expect(ul.querySelectorAll("a.tuile")).toHaveLength(exemple().length);
  });
  it("un titre HTML apparaît en texte, sans créer d'élément", () => {
    const ul = document.createElement("ul");
    const titre = "<img src=x onerror=alert(1)>";
    rendreGrille(ul, [creerSite({ titre, url: "https://a.com" })]);
    expect(ul.querySelector("img")).toBeNull();
    expect(ul.querySelector(".tuile-titre").textContent).toBe(titre);
  });
});
