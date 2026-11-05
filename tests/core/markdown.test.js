// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { outilMarkdown, rendreMarkdown } from "../../src/core/markdown.js";

const rendre = (texte) => {
  const boite = document.createElement("div");
  boite.append(rendreMarkdown(texte));
  return boite;
};

describe("rendreMarkdown : contenu utile", () => {
  it("titres, listes, code, gras, italique, citation, séparateur, barré", () => {
    const h = rendre("# T1\n\n## T2\n\n**gras** *ital* ~~barré~~\n\n- a\n- b\n\n1. x\n\n> citation\n\n---\n\n`code`\n\n```\nbloc\n```").innerHTML;
    for (const balise of ["<h1>", "<h2>", "<strong>", "<em>", "<del>", "<ul>", "<ol>", "<blockquote>", "<hr>", "<code>", "<pre>"])
      expect(h).toContain(balise);
  });
  it("un titre de niveau 6 est ramené au niveau 4", () => {
    expect(rendre("###### petit").querySelector("h4")).not.toBeNull();
  });
  it("lien http/https : nouvelle fenêtre, noopener noreferrer", () => {
    const a = rendre("[site](https://exemple.fr/page)").querySelector("a");
    expect(a.getAttribute("href")).toBe("https://exemple.fr/page");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("cases à cocher rendues, désactivées", () => {
    const cases = [...rendre("- [ ] à faire\n- [x] fait").querySelectorAll("input")];
    expect(cases).toHaveLength(2);
    for (const c of cases) {
      expect(c.getAttribute("type")).toBe("checkbox");
      expect(c.hasAttribute("disabled")).toBe(true);
    }
  });
  it("texte vide ou absent", () => {
    expect(rendre("").textContent).toBe("");
    expect(rendre(undefined).textContent).toBe("");
  });
  it("texte très long et Markdown mal formé ne plantent pas", () => {
    expect(rendre("a".repeat(20_000)).textContent.trim().length).toBe(20_000);
    expect(() => rendre("**gras [lien](http://x ` > # - [ ] ![")).not.toThrow();
    expect(() => rendre("[".repeat(5000))).not.toThrow();
  });
});

describe("rendreMarkdown : charges XSS", () => {
  const charges = readFileSync("tests/fixtures/xss-markdown.txt", "utf8").split("\n").filter(Boolean);
  it("la liste de charges n'est pas vide", () => expect(charges.length).toBeGreaterThan(30));

  it.each(charges.map((c, i) => [i, c]))("charge %i neutralisée", (_i, charge) => {
    const boite = rendre(charge);
    const interdit = boite.querySelectorAll(
      "script, style, iframe, object, embed, img, svg, math, form, video, audio, source, base, meta, link, details, body, button, textarea, select",
    );
    expect(interdit).toHaveLength(0);
    for (const noeud of boite.querySelectorAll("*")) {
      for (const attr of noeud.getAttributeNames()) {
        expect(attr.startsWith("on"), `${noeud.tagName} ${attr}`).toBe(false);
        expect(["href", "type", "checked", "disabled", "target", "rel"]).toContain(attr);
      }
      if (noeud.tagName === "A" && noeud.hasAttribute("href"))
        expect(noeud.getAttribute("href")).toMatch(/^https?:/i);
      if (noeud.tagName === "INPUT") {
        expect(noeud.getAttribute("type")).toBe("checkbox");
        expect(noeud.hasAttribute("disabled")).toBe(true);
      }
    }
  });

  it("une image distante est remplacée par son texte alternatif", () => {
    const boite = rendre("![texte alt](http://tracker.example/p.gif)");
    expect(boite.querySelector("img")).toBeNull();
    expect(boite.textContent).toContain("texte alt");
    expect(boite.innerHTML).not.toContain("tracker.example");
  });
  it("le HTML brut est affiché comme texte", () => {
    const boite = rendre("<b>gras ?</b>");
    expect(boite.querySelector("b")).toBeNull();
    expect(boite.textContent).toContain("<b>gras ?</b>");
  });
});

describe("outilMarkdown", () => {
  it("gras autour de la sélection, et on le retire au second appel", () => {
    const a = outilMarkdown("un mot ici", 3, 6, "gras");
    expect(a.valeur).toBe("un **mot** ici");
    expect(a.valeur.slice(a.debut, a.fin)).toBe("mot");
    const b = outilMarkdown(a.valeur, a.debut, a.fin, "gras");
    expect(b.valeur).toBe("un mot ici");
  });
  it("italique sans sélection place le curseur entre les marques", () => {
    const r = outilMarkdown("ab", 1, 1, "italique");
    expect(r.valeur).toBe("a**b");
    expect(r.debut).toBe(2);
  });
  it("liste et case : préfixe chaque ligne touchée, le second appel l'enlève", () => {
    const r = outilMarkdown("a\nb\nc", 0, 3, "liste");
    expect(r.valeur).toBe("- a\n- b\nc");
    expect(outilMarkdown(r.valeur, r.debut, r.fin, "liste").valeur).toBe("a\nb\nc");
    expect(outilMarkdown("tâche", 0, 0, "case").valeur).toBe("- [ ] tâche");
  });
});
