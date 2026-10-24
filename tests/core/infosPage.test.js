import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import {
  classerIcones,
  extraireInfos,
  iconesDuManifeste,
  lireTaille,
  nettoyerTitre,
} from "../../src/core/infosPage.js";

const fenetre = new Window();
function analyser(fixture, base = "https://www.exemple.com/page") {
  const html = readFileSync(new URL(`../fixtures/pages/${fixture}.html`, import.meta.url), "utf8");
  const doc = new fenetre.DOMParser().parseFromString(html, "text/html");
  return extraireInfos(doc, base);
}

describe("extraireInfos", () => {
  it("apple-touch-icon et favicon 32, mask-icon ignoré", () => {
    const r = analyser("apple-et-favicon", "https://github.com/");
    expect(r.titre).toBe("GitHub");
    expect(r.icones.map((i) => i.href)).toEqual([
      "https://github.com/favicon-32.png",
      "https://github.com/apple-touch-icon.png",
      "https://github.com/favicon.ico",
    ]);
    expect(classerIcones(r.icones)[0].href).toBe("https://github.com/apple-touch-icon.png");
  });
  it("chemins relatifs résolus avec <base href>", () => {
    const r = analyser("base-href");
    expect(r.icones[0].href).toBe("https://cdn.exemple.com/statique/img/favicon.png");
    expect(r.icones.at(-1).href).toBe("https://www.exemple.com/favicon.ico");
  });
  it("sizes multiples : la plus grande", () => {
    expect(analyser("tailles-multiples").icones[0].taille).toBe(96);
  });
  it("uniquement /favicon.ico implicite", () => {
    expect(analyser("favicon-implicite").icones).toEqual([
      { href: "https://www.exemple.com/favicon.ico", taille: 0, type: "", rel: "implicite" },
    ]);
  });
  it("SVG passe avant le .ico", () => {
    expect(classerIcones(analyser("svg").icones).map((i) => i.href)).toEqual([
      "https://www.exemple.com/icone.svg",
      "https://www.exemple.com/favicon.ico",
    ]);
  });
  it("titre long découpé", () => {
    expect(analyser("titre-long", "https://monsupersite.fr").titre).toBe("Mon Super Site");
  });
  it("entités décodées", () => {
    expect(analyser("entites").titre).toBe("Café & Thé — Boutique");
  });
  it("sans titre : domaine ; icône data: ignorée", () => {
    const r = analyser("sans-titre");
    expect(r.titre).toBe("exemple.com");
    expect(r.icones.every((i) => i.href.startsWith("https://"))).toBe(true);
  });
  it("manifeste et og:site_name", () => {
    const r = analyser("manifeste");
    expect(r.titre).toBe("Mon Appli");
    expect(r.manifeste).toBe("https://www.exemple.com/site.webmanifest");
  });
  it("HTML cassé ne plante pas", () => {
    const r = analyser("casse");
    expect(typeof r.titre).toBe("string");
    expect(r.icones.length).toBeGreaterThanOrEqual(1);
  });
  it("page de consentement : domaine", () => {
    expect(analyser("consentement", "https://www.youtube.com").titre).toBe("youtube.com");
  });
  it("og:title en dernier recours", () => {
    expect(analyser("og-title").titre).toBe("Titre Open Graph");
  });
});

describe("nettoyerTitre", () => {
  const cas = [
    ["  GitHub  ", "github.com", "GitHub"],
    ["", "exemple.com", "exemple.com"],
    ["Le Monde.fr - Actualités et Infos en France et dans le monde", "lemonde.fr", "Le Monde.fr"],
    ["YouTube", "youtube.com", "YouTube"],
    ["Wikipédia, l'encyclopédie libre", "fr.wikipedia.org", "Wikipédia, l'encyclopédie libre"],
    ["Notion – The all-in-one workspace for your notes", "notion.so", "Notion"],
    ["Connexion", "mail.google.com", "mail.google.com"],
    ["Just a moment...", "exemple.com", "exemple.com"],
    ["A\n\n  B", "x.com", "A B"],
    ["x".repeat(80), "x.com", `${"x".repeat(59)}…`],
    ["Court | Titre", "a.com", "Court | Titre"],
  ];
  for (const [entree, dom, attendu] of cas) {
    it(JSON.stringify(entree).slice(0, 40), () => expect(nettoyerTitre(entree, dom)).toBe(attendu));
  }
});

describe("classerIcones et manifeste", () => {
  it("ordre attendu", () => {
    const c = [
      { href: "https://a.com/favicon.ico", taille: 0, type: "", rel: "implicite" },
      { href: "https://a.com/16.png", taille: 16, type: "image/png", rel: "icon" },
      { href: "https://a.com/m512.png", taille: 512, type: "image/png", rel: "manifeste" },
      { href: "https://a.com/192.png", taille: 192, type: "image/png", rel: "icon" },
      { href: "https://a.com/i.svg", taille: 0, type: "", rel: "icon" },
      { href: "https://a.com/apple.png", taille: 180, type: "", rel: "apple-touch-icon" },
      { href: "https://a.com/declared.ico", taille: 32, type: "", rel: "icon" },
    ];
    expect(classerIcones(c).map((i) => i.href.split("/").pop())).toEqual([
      "apple.png",
      "i.svg",
      "192.png",
      "m512.png",
      "16.png",
      "declared.ico",
      "favicon.ico",
    ]);
  });
  it("icônes du manifeste ≥ 128, masquables seules exclues", () => {
    const json = {
      icons: [
        { src: "/i/64.png", sizes: "64x64" },
        { src: "/i/192.png", sizes: "192x192" },
        { src: "/i/512.png", sizes: "512x512", purpose: "maskable" },
        { src: "/i/256.png", sizes: "256x256", purpose: "any maskable" },
      ],
    };
    expect(iconesDuManifeste(json, "https://a.com/app/manifest.json").map((i) => i.href)).toEqual([
      "https://a.com/i/256.png",
      "https://a.com/i/192.png",
    ]);
    expect(iconesDuManifeste(null, "https://a.com")).toEqual([]);
  });
  it("lireTaille", () => {
    expect(lireTaille("any")).toBe(Infinity);
    expect(lireTaille("16x16 48x48")).toBe(48);
    expect(lireTaille(null)).toBe(0);
  });
});
