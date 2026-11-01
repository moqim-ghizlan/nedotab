import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CONFIG_PAR_DEFAUT } from "../../functions/src/ia/config.js";
import { creerFonctionsIa } from "../../functions/src/ia/fonctions.js";
import { lireSortieRangement } from "../../functions/src/ia/rangementSortie.js";
import { consommer } from "../../functions/src/quota.js";
import { baseMemoire } from "./baseMemoire.js";

const tables = {
  sites: { s1: "id-1", s2: "id-2", s3: "id-3" },
  dossiers: { d1: "id-d1" },
};
const id = () => "p";
const lire = (obj) => lireSortieRangement(JSON.stringify(obj), tables, id);

describe("lireSortieRangement", () => {
  it("groupes valides : références traduites, une proposition indépendante par groupe", () => {
    const r = lire({
      groupes: [
        {
          titre: "Voyage",
          explication: "Regroupe les réservations.",
          actions: [
            { outil: "creer_dossier", titre: "Voyage", sites: ["s1", "s2"] },
            { outil: "deplacer", element: "s3", vers: "nouveau:0" },
          ],
        },
        { titre: "Renommer", explication: "", actions: [{ outil: "renommer", element: "d1", titre: "Dev" }] },
      ],
    });
    expect(r.groupes).toHaveLength(2);
    expect(r.groupes[0].proposition.actions).toEqual([
      { outil: "creer_dossier", titre: "Voyage", parent: null, sites: ["id-1", "id-2"] },
      { outil: "deplacer", element: "id-3", vers: { nouveau: 0 } },
    ]);
    expect(r.groupes[0].explication).toBe("Regroupe les réservations.");
  });

  it("jamais de suppression ni d'ajout : ces actions sont retirées, le groupe vide disparaît", () => {
    const r = lire({
      groupes: [
        {
          titre: "Ménage",
          actions: [
            { outil: "supprimer", element: "s1" },
            { outil: "ajouter_site", url: "https://x.fr" },
            { outil: "modifier_tags", site: "s1", tags: ["a"] },
          ],
        },
        {
          titre: "Mixte",
          actions: [
            { outil: "supprimer", element: "s1" },
            { outil: "deplacer", element: "s2", vers: "d1" },
          ],
        },
      ],
    });
    expect(r.groupes.map((g) => g.titre)).toEqual(["Mixte"]);
    expect(r.groupes[0].proposition.actions.map((a) => a.outil)).toEqual(["deplacer"]);
  });

  it("références inventées ou d'une autre liste : actions écartées", () => {
    const r = lire({
      groupes: [{ titre: "X", actions: [{ outil: "deplacer", element: "s99", vers: "d1" }] }],
    });
    expect(r.groupes).toEqual([]);
  });

  it("8 groupes et 8 nouveaux dossiers au plus", () => {
    const groupe = (i) => ({
      titre: `G${i}`,
      actions: [{ outil: "creer_dossier", titre: `D${i}`, sites: ["s1"] }],
    });
    const r = lire({ groupes: Array.from({ length: 12 }, (_, i) => groupe(i)) });
    expect(r.groupes).toHaveLength(8);
    const deux = lire({
      groupes: [
        { titre: "A", actions: Array.from({ length: 5 }, (_, i) => ({ outil: "creer_dossier", titre: `a${i}` })) },
        { titre: "B", actions: Array.from({ length: 5 }, (_, i) => ({ outil: "creer_dossier", titre: `b${i}` })) },
      ],
    });
    expect(deux.groupes.map((g) => g.titre)).toEqual(["A"]);
  });

  it("titres et explications : texte seulement, HTML retiré ; JSON dans un bloc de code accepté", () => {
    const r = lireSortieRangement(
      '```json\n{"groupes":[{"titre":"<b>Voyage</b>","explication":"<img src=x onerror=alert(1)>Ok","actions":[{"outil":"renommer","element":"d1","titre":"V"}]}]}\n```',
      tables,
      id,
    );
    expect(r.groupes[0].titre).toBe("Voyage");
    expect(r.groupes[0].explication).toBe("Ok");
  });

  it("réponse illisible : null (un seul nouvel essai ensuite)", () => {
    expect(lireSortieRangement("pas du json", tables)).toBeNull();
    expect(lireSortieRangement('{"autre":1}', tables)).toBeNull();
    expect(lireSortieRangement(undefined, tables)).toBeNull();
    expect(lire({ groupes: [] })).toEqual({ groupes: [] });
  });
});

describe("suggererRangement (fonction)", () => {
  const CLE = "sk-test-VraieCleSecrete-1234WXYZ";
  const secret = randomBytes(32).toString("base64");
  const site = (id, titre, url) => ({ id, type: "site", titre, url, tags: [] });
  const grille = [
    site("a", "Booking", "https://booking.com"),
    site("b", "Skyscanner", "https://skyscanner.fr"),
    { id: "d", type: "dossier", titre: "Dev", items: [site("c", "GitHub", "https://github.com")] },
  ];

  async function monter(textes, grilleUtilisateur = grille) {
    const db = baseMemoire();
    const file = [...textes];
    const envoyer = vi.fn(async () => ({
      texte: file.shift() ?? "",
      modele: "m",
      jetonsEntree: 1,
      jetonsSortie: 1,
    }));
    const ia = creerFonctionsIa({
      db,
      secret: () => secret,
      fournisseurs: {
        gemini: { formatCle: /^sk-/, verifierCle: async () => ({ valide: true }), envoyer },
      },
      config: async () => CONFIG_PAR_DEFAUT,
      consommer: (u, o) => consommer(db, u, o),
      horloge: () => Date.UTC(2026, 10, 1),
    });
    await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
    await db.doc("users/u1").set({ reglages: { ia: { actif: true } }, grille: grilleUtilisateur });
    return { ia, envoyer, db };
  }

  it("liste des sites et des dossiers dans le message, groupes validés renvoyés", async () => {
    const reponse = JSON.stringify({
      groupes: [
        {
          titre: "Voyage",
          explication: "Réservations.",
          actions: [{ outil: "creer_dossier", titre: "Voyage", sites: ["s1", "s2"] }],
        },
      ],
    });
    const { ia, envoyer } = await monter([reponse]);
    const r = await ia.suggererRangement("u1", { portee: "tout" });
    const appel = envoyer.mock.calls[0][0];
    expect(appel.systeme).toMatch(/Tu ne supprimes jamais rien/);
    expect(appel.messages[0].texte).toMatch(/<sites>\ns1\|Booking\|/);
    expect(appel.messages[0].texte).toMatch(/<dossiers>\nd1\|Dev\|1\n<\/dossiers>/);
    expect(appel.messages[0].texte).not.toMatch(/"a"|id-/);
    expect(r.groupes[0].proposition.actions).toEqual([
      { outil: "creer_dossier", titre: "Voyage", parent: null, sites: ["a", "b"] },
    ]);
  });

  it("portée « accueil » : seuls les sites de l'accueil sont envoyés", async () => {
    const { ia, envoyer } = await monter(['{"groupes":[]}']);
    await ia.suggererRangement("u1", { portee: "accueil" });
    const texte = envoyer.mock.calls[0][0].messages[0].texte;
    expect(texte).toMatch(/Booking/);
    expect(texte).not.toMatch(/GitHub/);
  });

  it("un format invalide est redemandé une fois, puis erreur", async () => {
    const bon = await monter(["pas du json", '{"groupes":[]}']);
    expect(await bon.ia.suggererRangement("u1", { portee: "tout" })).toMatchObject({ groupes: [] });
    expect(bon.envoyer).toHaveBeenCalledTimes(2);
    const mauvais = await monter(["non", "toujours non"]);
    await expect(mauvais.ia.suggererRangement("u1", { portee: "tout" })).rejects.toMatchObject({
      code: "reponse-invalide",
    });
  });

  it("moins de deux sites : aucun appel payant ; portée inconnue refusée", async () => {
    const { ia, envoyer, db } = await monter([], [site("a", "A", "https://a.fr")]);
    expect(await ia.suggererRangement("u1", { portee: "tout" })).toEqual({ groupes: [] });
    expect(envoyer).not.toHaveBeenCalled();
    expect(db.lire("users/u1/prive/quota")).toBeUndefined();
    await expect(ia.suggererRangement("u1", { portee: "dossier-x" })).rejects.toThrow();
  });
});
