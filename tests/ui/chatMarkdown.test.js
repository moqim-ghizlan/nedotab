// @vitest-environment jsdom
// DOMPurify needs a faithful DOM: happy-dom does not walk the children, jsdom does.
import { describe, expect, it } from "vitest";
import { rendreMarkdown } from "../../src/ui/chat/markdown.js";

const html = (md) => {
  const boite = document.createElement("div");
  boite.append(rendreMarkdown(md));
  return boite;
};

describe("rendreMarkdown : rendu normal", () => {
  it("gras, italique, listes, code, citation, titres", () => {
    const b = html(
      "# Titre\n\n**gras** et *italique*\n\n- un\n- deux\n\n1. a\n2. b\n\n`code`\n\n```\nbloc\n```\n\n> cité",
    );
    expect(b.querySelector("h3").textContent).toBe("Titre");
    expect(b.querySelector("strong").textContent).toBe("gras");
    expect(b.querySelector("em").textContent).toBe("italique");
    expect(b.querySelectorAll("ul li")).toHaveLength(2);
    expect(b.querySelectorAll("ol li")).toHaveLength(2);
    expect(b.querySelector("pre code").textContent).toContain("bloc");
    expect(b.querySelector("blockquote")).not.toBeNull();
  });
  it("niveaux de titres ramenés à h3 / h4", () => {
    const b = html("# a\n\n## b\n\n#### c");
    expect([...b.querySelectorAll("h3, h4")].map((h) => h.tagName)).toEqual(["H3", "H3", "H4"]);
    expect(b.querySelector("h1, h2, h5, h6")).toBeNull();
  });
  it("lien https : nouvel onglet, noopener, domaine en infobulle", () => {
    const a = html("[le site](https://www.exemple.com/page)").querySelector("a");
    expect(a.getAttribute("href")).toBe("https://www.exemple.com/page");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("title")).toBe("exemple.com");
  });
  it("tableau dans un conteneur qui défile seul", () => {
    const b = html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(b.querySelector(".chat-tableau > table th").textContent).toBe("a");
  });
});

describe("rendreMarkdown : injections neutralisées", () => {
  const attaques = {
    script: "<script>alert(1)</script>texte",
    "img onerror": '<img src=x onerror="alert(1)">',
    "img markdown": "![pixel](https://tracker.exemple/p.gif)",
    iframe: '<iframe src="https://exemple.com"></iframe>',
    style: '<p style="color:red" onclick="alert(1)">x</p>',
    "lien javascript": "[clic](javascript:alert(1))",
    "lien data": "[clic](data:text/html;base64,PHNjcmlwdD4=)",
    "lien vbscript": "[clic](vbscript:msgbox)",
    "lien html": '<a href="javascript:alert(1)" onclick="alert(2)">x</a>',
    svg: '<svg onload="alert(1)"><circle/></svg>',
    formulaire: '<form action="https://evil"><input name=a></form>',
  };
  for (const [nom, md] of Object.entries(attaques)) {
    it(nom, () => {
      const b = html(md);
      expect(b.querySelector("script, img, iframe, svg, form, input, style")).toBeNull();
      for (const noeud of b.querySelectorAll("*")) {
        for (const attribut of noeud.getAttributeNames()) {
          expect(["href", "target", "rel", "title"]).toContain(attribut);
        }
        expect(noeud.getAttribute("href") ?? "").not.toMatch(/^(javascript|data|vbscript):/i);
      }
    });
  }
  it("le HTML brut est montré comme du texte, pas interprété", () => {
    expect(html("<b>gras ?</b>").textContent).toContain("<b>gras ?</b>");
  });
  it("une image n'est jamais rendue, seule sa description reste", () => {
    const b = html("![texte alternatif](https://x.fr/a.png)");
    expect(b.querySelector("img")).toBeNull();
    expect(b.textContent).toContain("texte alternatif");
  });
});
