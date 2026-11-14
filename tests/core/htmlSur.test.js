import { describe, expect, it } from "vitest";
import { retirerGestionnaires } from "../../src/core/htmlSur.js";

describe("retirerGestionnaires", () => {
  it("retire les gestionnaires entre guillemets, apostrophes ou nus", () => {
    const html = `<body onload="a()" class="x"><img src=a onerror='b()' alt=y><a onclick=c()>t</a></body>`;
    const sortie = retirerGestionnaires(html);
    expect(sortie).not.toMatch(/\son[a-z]+=/i);
    expect(sortie).toContain(`class="x"`);
    expect(sortie).toContain(`src=a`);
  });
  it("retire plusieurs gestionnaires sur la même balise", () => {
    expect(retirerGestionnaires(`<img onload="a()" onerror="b()" src="s">`)).toBe(`<img src="s">`);
  });
  it("garde le titre, les liens d'icônes et le texte", () => {
    const html = `<title>T</title><link rel="icon" href="/i.png"><p>bonjour</p>`;
    expect(retirerGestionnaires(html)).toBe(html);
  });
  it("renvoie une chaîne vide si l'entrée n'est pas du texte", () => {
    expect(retirerGestionnaires(undefined)).toBe("");
  });
});
