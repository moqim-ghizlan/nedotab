import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { extraireContenu, MAX_TOTAL, tronquerProprement } from "../../src/core/extraitPage.js";

const fenetre = new Window();
function extrait(nom, url = "https://www.exemple.com/page") {
  const html = readFileSync(
    new URL(`../fixtures/pages/contenu/${nom}.html`, import.meta.url),
    "utf8",
  );
  return extraireContenu(new fenetre.DOMParser().parseFromString(html, "text/html"), url);
}

const CAS = [
  [
    "article-presse",
    "fr",
    ["hérons et des martins-pêcheurs", "rapidité du retour"],
    ["Politique", "Abonnez-vous", "Mentions légales"],
  ],
  [
    "saas-accueil",
    "en",
    ["plan sprints, track progress"],
    ["Pricing", "Start free trial", "Privacy Terms"],
  ],
  [
    "depot-code",
    "en",
    ["streaming JSON parser for Node.js", "npm install quickparse"],
    ["Pull requests", "Security"],
  ],
  [
    "wikipedia",
    "fr",
    ["330 mètres de hauteur", "Exposition universelle de 1889"],
    ["Portails", "issu de Wikipédia"],
  ],
  [
    "boutique",
    "fr",
    ["garde le thé chaud", "Contenance 1,2 litre"],
    ["Ajouter au panier", "Salon"],
  ],
  ["bandeau-cookies", "fr", ["stages de tournage"], ["cookies", "consentement", "Accepter tout"]],
  ["avec-main", "fr", ["déchets de cuisine"], ["Liens utiles", "hors du contenu principal"]],
  ["sans-main", "fr", ["sorties en montagne", "mois de septembre"], []],
  ["blog-anglais", "en", ["Travelling by train"], []],
  ["japonais", "ja", ["清水寺や金閣寺"], []],
  ["menus-enormes", "fr", ["démarches en ligne de la mairie"], ["Rubrique 5", "Accueil Contact"]],
];

describe("extraireContenu — fixtures", () => {
  it.each(CAS)("%s", (nom, langue, attendu, interdit) => {
    const e = extrait(nom);
    expect(e.langue).toBe(langue);
    for (const phrase of attendu) expect(e.texte).toContain(phrase);
    for (const phrase of interdit) expect(e.texte).not.toContain(phrase);
    expect(JSON.stringify(e).length).toBeLessThanOrEqual(MAX_TOTAL);
    expect(e.texte.length).toBeLessThanOrEqual(2000);
  });

  it("métadonnées : titre, description, type, titres", () => {
    const e = extrait("article-presse");
    expect(e.titre).toBe("Le Courrier du Centre");
    expect(e.description).toBe("Après dix ans de travaux, les berges retrouvent leurs oiseaux.");
    expect(e.type).toBe("article");
    expect(e.titres).toEqual(["Les berges de la Loire renaissent", "Dix ans de travaux"]);
    expect(e.domaine).toBe("exemple.com");
  });
  it("og:locale quand <html> n'a pas de lang", () => {
    const e = extraireContenu(
      new fenetre.DOMParser().parseFromString(
        '<html><head><title>X</title><meta property="og:locale" content="fr_FR"></head><body><p>Un texte assez long ici</p></body></html>',
        "text/html",
      ),
      "https://exemple.com/",
    );
    expect(e.langue).toBe("fr");
  });
  it("page vide générée en JavaScript : texte vide, pas d'erreur", () => {
    const e = extrait("vide-javascript");
    expect(e.texte).toBe("");
    expect(e.titre).toBe("App");
  });
  it("menus énormes : texte court et propre", () => {
    const e = extrait("menus-enormes");
    expect(e.texte.startsWith("Portail des services municipaux")).toBe(true);
  });
  it("page d'erreur ou de contrôle en 200 : extrait réduit", () => {
    const e = extrait("page-erreur", "https://www.exemple.com/x");
    expect(e).toMatchObject({ reduit: true, texte: "", titres: [], domaine: "exemple.com" });
  });
  it("confidentialité : extrait réduit et requête retirée", () => {
    const e = extrait("article-presse", "https://exemple.com/a?token=secret");
    expect(e.reduit).toBe(true);
    expect(e.url).toBe("https://exemple.com/a");
    expect(e.texte).toBe("");
    expect(extrait("article-presse", "http://192.168.0.4/").reduit).toBe(true);
    expect(extrait("article-presse", "https://www.mabanque.fr/").reduit).toBe(true);
  });
  it("limite totale respectée même avec description, titres et mots-clés longs", () => {
    const titres = Array.from({ length: 30 }, (_, i) => `<h2>${"t".repeat(300)}${i}</h2>`).join("");
    const mots = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(",");
    const html = `<html lang="fr"><head><title>Test</title><meta name="description" content="${"d".repeat(900)}"><meta name="keywords" content="${mots}"></head><body>${titres}<p>${"phrase assez longue pour remplir. ".repeat(200)}</p></body></html>`;
    const e = extraireContenu(
      new fenetre.DOMParser().parseFromString(html, "text/html"),
      "https://exemple.com/",
    );
    expect(e.titres).toHaveLength(10);
    expect(e.titres[0].length).toBe(120);
    expect(e.motsCles).toHaveLength(15);
    expect(JSON.stringify(e).length).toBeLessThanOrEqual(MAX_TOTAL);
  });
});

describe("tronquerProprement", () => {
  it("coupe à la fin d'une phrase, sinon d'un mot", () => {
    const t = "Une phrase complète ici. Une autre phrase qui dépasse largement la limite";
    expect(tronquerProprement(t, 40)).toBe("Une phrase complète ici.");
    expect(tronquerProprement("alpha beta gamma delta epsilon", 17)).toBe("alpha beta gamma");
    expect(tronquerProprement("court", 40)).toBe("court");
  });
});
