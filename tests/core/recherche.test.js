import { describe, expect, it } from "vitest";
import { indexer, normaliser, rechercher, suggererTags } from "../../src/core/recherche.js";

const site = (id, titre, url) => ({ id, type: "site", titre, url, creeLe: 0 });
const dossier = (id, titre, items) => ({ id, type: "dossier", titre, items, creeLe: 0 });

const GRILLE = [
  site("gh", "GitHub", "https://github.com"),
  site("dig", "Digital Magazine", "https://digimag.fr"),
  site("gl", "GitLab", "https://gitlab.com"),
  site("wiki", "Wikipédia", "https://fr.wikipedia.org"),
  dossier("travail", "Travail", [
    dossier("clients", "Clients", [site("crm", "Mon CRM", "https://crm.exemple.fr")]),
  ]),
  site("elec", "Électricité de France", "https://edf.fr"),
];

const ids = (r) => r.map((x) => x.entree.id);

describe("normaliser", () => {
  it("accents, majuscules, espaces", () => {
    expect(normaliser("Électricité")).toBe(normaliser("electricite"));
    expect(normaliser("  Bonjour    le   monde ")).toBe("bonjour le monde");
  });
});

describe("rechercher", () => {
  const index = indexer(GRILLE);
  it("« git » : GitHub et GitLab avant Digital", () => {
    const r = ids(rechercher(index, "git"));
    expect(r.slice(0, 2).sort()).toEqual(["gh", "gl"]);
    expect(r.indexOf("dig")).toBeGreaterThan(1);
  });
  it("« trav cli » trouve le site rangé dans Travail › Clients", () => {
    const r = rechercher(index, "trav cli");
    expect(ids(r)).toContain("crm");
    expect(r.find((x) => x.entree.id === "crm").entree.cheminTexte).toBe(
      "Accueil › Travail › Clients",
    );
  });
  it("« gh » trouve GitHub par initiales", () => {
    expect(ids(rechercher(index, "gh"))[0]).toBe("gh");
  });
  it("un mot absent partout : aucun résultat", () => {
    expect(rechercher(index, "git zzz")).toEqual([]);
    expect(rechercher(index, "   ")).toEqual([]);
  });
  it("sans accents ni majuscules", () => {
    expect(ids(rechercher(index, "electricite"))).toEqual(["elec"]);
    expect(ids(rechercher(index, "WIKIPEDIA"))).toEqual(["wiki"]);
  });
  it("ordre des mots indifférent", () => {
    expect(ids(rechercher(index, "france electricite"))).toEqual(["elec"]);
  });
  it("plages de mise en évidence sur le titre affiché", () => {
    const [r] = rechercher(index, "elec");
    expect(r.plages).toEqual([[0, 4]]);
    expect(r.entree.titre.slice(0, 4)).toBe("Élec");
    const [m] = rechercher(index, "magazine digital").filter((x) => x.entree.id === "dig");
    expect(m.plages).toEqual([
      [0, 7],
      [8, 16],
    ]);
  });
  it("dossiers trouvés aussi", () => {
    expect(ids(rechercher(index, "clients"))).toContain("clients");
  });
  it("ordre stable à score égal (alphabétique)", () => {
    const g = [site("b", "Beta site", "https://b.fr"), site("a", "Alpha site", "https://a.fr")];
    expect(ids(rechercher(indexer(g), "site"))).toEqual(["a", "b"]);
  });
  it("maximum de résultats", () => {
    const g = Array.from({ length: 20 }, (_, i) => site(`s${i}`, `Site ${i}`, `https://s${i}.fr`));
    expect(rechercher(indexer(g), "site")).toHaveLength(8);
  });
});

describe("index", () => {
  it("mémoïsé sur la référence de la grille", () => {
    expect(indexer(GRILLE)).toBe(indexer(GRILLE));
    expect(indexer([...GRILLE])).not.toBe(indexer(GRILLE));
  });
  it("performance indicative : 2 000 éléments, moins de 5 ms par frappe", () => {
    const g = [];
    for (let i = 0; i < 2000; i++)
      g.push(
        site(`p${i}`, `Projet numéro ${i} ${i % 7 ? "alpha" : "béta"}`, `https://projet${i}.fr`),
      );
    const index = indexer(g);
    rechercher(index, "pro"); // warm-up
    // Best of several runs: the other test files run in parallel and add noise.
    let parFrappe = Infinity;
    for (let essai = 0; essai < 5; essai++) {
      const debut = performance.now();
      for (const q of ["p", "pr", "pro", "proj", "projet be"]) rechercher(index, q);
      parFrappe = Math.min(parFrappe, (performance.now() - debut) / 5);
    }
    expect(parFrappe).toBeLessThan(5);
  });
});

describe("tags et description (V4.7)", () => {
  const enrichi = (id, titre, url, tags, description = "") => ({
    ...site(id, titre, url),
    tags,
    description,
  });
  const G = [
    enrichi("pix", "Pixlr", "https://pixlr.com", ["retouche photo", "dev"], "Éditeur en ligne"),
    enrichi("ph", "Photo Club", "https://club.fr", [], ""),
    enrichi(
      "ed",
      "Éditeur",
      "https://editeur.fr",
      ["outil"],
      "Un outil en ligne pour retoucher des photos et des images, très pratique au quotidien",
    ),
    enrichi("gh2", "GitHub", "https://github.com", ["dev", "git"]),
    enrichi("dm", "Domaine photo", "https://photo-exemple.fr", []),
    dossier("d", "Dossier", [enrichi("x", "X", "https://x.fr", ["dev"])]),
  ];
  const index = indexer(G);

  it("« photo » trouve le site taggé ; le titre passe devant", () => {
    const r = rechercher(index, "photo");
    expect(ids(r)).toContain("pix");
    expect(ids(r).indexOf("ph")).toBeLessThan(ids(r).indexOf("pix"));
    expect(ids(r).indexOf("pix")).toBeLessThan(ids(r).indexOf("ed")); // tag avant description
  });
  it("raison : tag", () => {
    const r = rechercher(index, "photo").find((x) => x.entree.id === "pix");
    expect(r.raison.champ).toBe("tag");
    expect(r.raison.texte).toBe("retouche photo");
    expect(r.raison.plages).toEqual([[9, 14]]);
  });
  it("« retoucher » trouve via la description, extrait autour du mot", () => {
    const [r] = rechercher(index, "retoucher");
    expect(r.entree.id).toBe("ed");
    expect(r.raison.champ).toBe("description");
    expect(r.raison.texte.length).toBeLessThanOrEqual(70);
    const [a, b] = r.raison.plages[0];
    expect(r.raison.texte.slice(a, b)).toBe("retoucher");
  });
  it("titre, domaine et chemin gardent leur raison", () => {
    expect(rechercher(index, "github")[0].raison.champ).toBe("titre");
    expect(rechercher(index, "pixlr.com")[0].raison.champ).toBe("domaine");
    expect(rechercher(index, "exemple")[0].raison.champ).toBe("domaine");
    expect(rechercher(indexer(GRILLE), "clients").at(-1).raison.champ).toBeDefined();
  });
  it("un tag exact passe devant un domaine partiel", () => {
    const g = [
      enrichi("a", "Alpha", "https://devnet.fr", []),
      enrichi("b", "Beta", "https://beta.fr", ["dev"]),
    ];
    expect(ids(rechercher(indexer(g), "dev"))).toEqual(["b", "a"]);
  });
  it("#dev filtre sur le début des tags", () => {
    expect(ids(rechercher(index, "#dev")).sort()).toEqual(["gh2", "pix", "x"]);
    expect(ids(rechercher(index, "#de")).sort()).toEqual(["gh2", "pix", "x"]);
  });
  it("#dev git combine filtre et recherche ; plusieurs # = tous requis", () => {
    expect(ids(rechercher(index, "#dev git"))).toEqual(["gh2"]);
    expect(ids(rechercher(index, "#dev #git"))).toEqual(["gh2"]);
    expect(ids(rechercher(index, "#dev #outil"))).toEqual([]);
  });
  it("#inconnu → aucun résultat ; # seul → rien", () => {
    expect(rechercher(index, "#inconnu")).toEqual([]);
    expect(rechercher(index, "#")).toEqual([]);
  });
  it("filtre seul : la raison est le tag", () => {
    const [r] = rechercher(index, "#git");
    expect(r.raison).toMatchObject({ champ: "tag", texte: "git" });
  });
  it("suggererTags : les plus utilisés d'abord, filtrés par préfixe", () => {
    expect(suggererTags(G)[0]).toBe("dev");
    expect(suggererTags(G, "gi")).toEqual(["git"]);
    expect(suggererTags(G, "zz")).toEqual([]);
  });
  it("performance indicative : 2 000 sites avec tags et descriptions", () => {
    const g = Array.from({ length: 2000 }, (_, i) =>
      enrichi(
        `p${i}`,
        `Projet ${i}`,
        `https://projet${i}.fr`,
        [`tag${i % 40}`, "outil"],
        `Une description assez longue pour le site numéro ${i}, utile pour tester la vitesse`,
      ),
    );
    const idx = indexer(g);
    rechercher(idx, "out");
    let parFrappe = Infinity;
    for (let essai = 0; essai < 15; essai++) {
      const debut = performance.now();
      for (const q of ["ou", "out", "desc", "descrip", "#tag1 vitesse"]) rechercher(idx, q);
      parFrappe = Math.min(parFrappe, (performance.now() - debut) / 5);
    }
    expect(parFrappe).toBeLessThan(5);
  });
});
