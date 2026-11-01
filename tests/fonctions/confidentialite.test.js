import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CONFIG_PAR_DEFAUT } from "../../functions/src/ia/config.js";
import { creerEffacements } from "../../functions/src/ia/effacements.js";
import { creerFonctionsIa } from "../../functions/src/ia/fonctions.js";
import { consommer } from "../../functions/src/quota.js";
import {
  champsAutorises,
  permis,
  validerConfidentialite,
} from "../../src/core/confidentialiteIa.js";
import { baseMemoire, inc } from "./baseMemoire.js";

const CLE = "sk-test-VraieCleSecrete-1234WXYZ";
const secret = randomBytes(32).toString("base64");
const CONV = "conv-0001";
const grille = [
  {
    id: "a",
    type: "site",
    titre: "Marmiton",
    url: "https://marmiton.org",
    tags: ["cuisine"],
    description: "Recettes de cuisine",
  },
  {
    id: "d",
    type: "dossier",
    titre: "Loisirs-prives",
    items: [{ id: "b", type: "site", titre: "Jeux", url: "https://jeux.fr", tags: ["jeu"], description: "Jeux en ligne" }],
  },
  { id: "x", type: "site", titre: "Secret", url: "https://secret.fr", tags: [], description: "", iaExclu: true },
];
const JSON_RECHERCHE = '{"intention":"site","resultats":[],"aucunResultat":true}';

async function monter({ confidentialite, textes = [JSON_RECHERCHE], g = grille, lirePage } = {}) {
  const db = baseMemoire({
    [`users/u1/conversations/${CONV}`]: { titre: "T", majLe: new Date(0), creeLe: new Date(0), nbMessages: 0 },
    [`users/u1/conversations/${CONV}/messages/0000000000001-a`]: {
      role: "user",
      texte: "Quels sont mes sites de cuisine ?",
      creeLe: new Date(1),
      etat: "ok",
    },
  });
  const file = [...textes];
  const envoyer = vi.fn(async () => ({ texte: file.shift() ?? '{"tags":["t"],"description":"d"}', modele: "m", jetonsEntree: 1, jetonsSortie: 1 }));
  const ia = creerFonctionsIa({
    db,
    secret: () => secret,
    fournisseurs: { gemini: { formatCle: /^sk-/, verifierCle: async () => ({ valide: true }), envoyer } },
    config: async () => CONFIG_PAR_DEFAUT,
    consommer: (u, o) => consommer(db, u, o),
    increment: inc,
    lirePage: lirePage ?? (async () => ({ titre: "T", texte: "contenu de la page" })),
    horloge: () => Date.UTC(2026, 10, 2),
  });
  await ia.enregistrerCle("u1", { fournisseur: "gemini", cle: CLE });
  await db.doc("users/u1").set({
    reglages: { ia: { actif: true, ...(confidentialite ? { confidentialite } : {}) } },
    grille: g,
  });
  return { ia, db, envoyer };
}
const prompt = (envoyer) => {
  const a = envoyer.mock.calls[0][0];
  return `${a.systeme ?? ""}\n${a.messages.map((m) => m.texte).join("\n")}`;
};

describe("réglages de confidentialité (module partagé)", () => {
  it("tout est permis par défaut ; seuls les refus sont gardés", () => {
    expect(validerConfidentialite(undefined)).toBeNull();
    expect(validerConfidentialite({ chemins: true, historique: "non" })).toBeNull();
    expect(validerConfidentialite({ chemins: false, inconnu: false })).toEqual({ chemins: false });
    expect(permis(null, "chemins")).toBe(true);
    expect(permis({ chemins: false }, "chemins")).toBe(false);
  });
  it("champs de la liste selon les choix", () => {
    expect(champsAutorises(null)).toEqual(["titre", "domaine", "tags", "description", "chemin", "ajoute"]);
    expect(champsAutorises({ tagsDescriptions: false })).toEqual(["titre", "domaine", "chemin", "ajoute"]);
    expect(champsAutorises({ chemins: false })).not.toContain("chemin");
    expect(champsAutorises({ titresAdresses: false })).toEqual(["tags", "description", "chemin", "ajoute"]);
  });
});

describe("recherche : champs envoyés décidés par le serveur", () => {
  it("par défaut tout part, sauf les éléments exclus", async () => {
    const { ia, envoyer } = await monter();
    await ia.rechercher("u1", { question: "cuisine" });
    const t = prompt(envoyer);
    expect(t).toMatch(/Marmiton\|marmiton\.org\|cuisine\|Recettes de cuisine/);
    expect(t).toMatch(/Jeux\|jeux\.fr\|jeu\|Jeux en ligne\|Loisirs-prives/);
    expect(t).not.toMatch(/Secret|secret\.fr/);
  });
  it("tags et descriptions refusés : retirés de la liste", async () => {
    const { ia, envoyer } = await monter({ confidentialite: { tagsDescriptions: false } });
    await ia.rechercher("u1", { question: "cuisine" });
    const t = prompt(envoyer);
    expect(t).toMatch(/Marmiton\|marmiton\.org\|\|\|/);
    expect(t).not.toMatch(/Recettes de cuisine|\|cuisine\|/);
  });
  it("noms de dossiers refusés : colonne vide", async () => {
    const { ia, envoyer } = await monter({ confidentialite: { chemins: false } });
    await ia.rechercher("u1", { question: "jeux" });
    expect(prompt(envoyer)).not.toMatch(/Loisirs-prives/);
  });
  it("titres et adresses refusés : recherche impossible, rien n'est envoyé", async () => {
    const { ia, envoyer } = await monter({ confidentialite: { titresAdresses: false } });
    await expect(ia.rechercher("u1", { question: "cuisine" })).rejects.toMatchObject({
      code: "confidentialite-sites",
    });
    expect(envoyer).not.toHaveBeenCalled();
  });
});

describe("chat : la collection n'est jointe que si permis", () => {
  it("titres refusés : le chat répond sans connaître les sites", async () => {
    const { ia, envoyer } = await monter({ confidentialite: { titresAdresses: false }, textes: ["Je ne les connais pas."] });
    const r = await ia.chatConversation("u1", { convId: CONV });
    expect(envoyer.mock.calls[0][0].systeme).not.toMatch(/<sites>|Marmiton/);
    expect(r).not.toHaveProperty("consulte");
  });
  it("noms de dossiers refusés : pas de liste de dossiers dans le prompt", async () => {
    const { ia, envoyer } = await monter({ confidentialite: { chemins: false }, textes: ["ok"] });
    await ia.chatConversation("u1", { convId: CONV });
    const systeme = envoyer.mock.calls[0][0].systeme;
    expect(systeme).toMatch(/<sites>/);
    expect(systeme).not.toMatch(/Loisirs-prives/);
    expect(systeme).toMatch(/<dossiers>\n\n<\/dossiers>/);
  });
  it("historique non conservé : le serveur n'accepte plus que les messages, rien n'est écrit", async () => {
    const { ia, db } = await monter({ confidentialite: { historique: false }, textes: ["Salut"] });
    await expect(ia.chatConversation("u1", { convId: CONV })).rejects.toThrow(/inconnu/);
    const avant = db.chemins(`users/u1/conversations/${CONV}/messages/`).length;
    const r = await ia.chatConversation("u1", { messages: [{ role: "user", texte: "Bonjour" }] });
    expect(r.texte).toBe("Salut");
    expect(r).not.toHaveProperty("messageId");
    expect(db.chemins(`users/u1/conversations/${CONV}/messages/`)).toHaveLength(avant);
  });
  it("historique conservé : l'historique envoyé par le navigateur est refusé", async () => {
    const { ia } = await monter();
    await expect(ia.chatConversation("u1", { messages: [{ role: "user", texte: "x" }] })).rejects.toThrow();
  });
});

describe("tags : contenu des pages", () => {
  it("lecture des pages refusée : le serveur ignore l'extrait envoyé et ne lit rien", async () => {
    const lirePage = vi.fn();
    const { ia, envoyer } = await monter({ confidentialite: { lirePages: false }, lirePage });
    await ia.genererTags("u1", {
      url: "https://a.fr",
      titre: "A",
      extrait: { titre: "A", texte: "CONTENU-SECRET-DE-LA-PAGE" },
    });
    expect(lirePage).not.toHaveBeenCalled();
    expect(prompt(envoyer)).not.toMatch(/CONTENU-SECRET-DE-LA-PAGE/);
    await ia.genererTags("u1", { url: "https://b.fr", titre: "B" });
    expect(lirePage).not.toHaveBeenCalled();
  });
  it("lecture par le serveur refusée : pas de tags sans extrait (iPhone), l'extension fonctionne", async () => {
    const lirePage = vi.fn(async () => ({ titre: "T" }));
    const { ia } = await monter({ confidentialite: { lectureServeur: false }, lirePage });
    await expect(ia.genererTags("u1", { url: "https://a.fr", titre: "A" })).rejects.toMatchObject({
      code: "lecture-serveur-desactivee",
    });
    expect(lirePage).not.toHaveBeenCalled();
    await expect(
      ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait: { titre: "A" } }),
    ).resolves.toMatchObject({ tags: ["t"] });
  });
  it("une réponse en cache d'avant le réglage n'est pas resservie comme « avec contenu »", async () => {
    const { ia, db, envoyer } = await monter({ textes: [] });
    await ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait: { titre: "A", texte: "contenu" } });
    await db.doc("users/u1").set({ ...db.lire("users/u1"), reglages: { ia: { actif: true, confidentialite: { lirePages: false } } } });
    await ia.genererTags("u1", { url: "https://a.fr", titre: "A", extrait: { titre: "A", texte: "contenu" } });
    expect(envoyer).toHaveBeenCalledTimes(2);
  });
});

describe("rangement et exclusions", () => {
  it("rangement : les éléments exclus ne sont jamais envoyés ; titres refusés = refus", async () => {
    const { ia, envoyer } = await monter({ textes: ['{"groupes":[]}'] });
    await ia.suggererRangement("u1", { portee: "tout" });
    expect(prompt(envoyer)).not.toMatch(/Secret|secret\.fr/);
    const refus = await monter({ confidentialite: { titresAdresses: false } });
    await expect(refus.ia.suggererRangement("u1", { portee: "tout" })).rejects.toMatchObject({ code: "confidentialite-sites" });
  });
  it("un dossier exclu masque tout son contenu", async () => {
    const g = [
      { id: "s1", type: "site", titre: "Visible", url: "https://v.fr", tags: [] },
      { id: "d", type: "dossier", titre: "Cache", iaExclu: true, items: [{ id: "s2", type: "site", titre: "Dedans", url: "https://dedans.fr", tags: [] }] },
    ];
    const { ia, envoyer } = await monter({ g, textes: [JSON_RECHERCHE] });
    await ia.rechercher("u1", { question: "visible" });
    expect(prompt(envoyer)).toMatch(/Visible/);
    expect(prompt(envoyer)).not.toMatch(/Dedans|dedans\.fr|Cache/);
  });
});

describe("effacements", () => {
  const rempli = () =>
    baseMemoire({
      "users/u1/conversations/c1": { titre: "a" },
      "users/u1/conversations/c1/messages/m1": { texte: "x" },
      "users/u1/conversations/c2": { titre: "b" },
      "users/u1/prive/cacheIa/entrees/h1": { reponse: {} },
      "users/u1/prive/cacheIa/entrees/h2": { reponse: {} },
      "users/u1/prive/ia": { cles: { gemini: { chiffre: "secret" } } },
      "users/u1/prive/quota": { jour: "2026-11-02", appels: 5 },
      "users/u1/usage/2026-11": { total: { appels: 3 } },
      "users/u1/sauvegardes/s1": { grille: [] },
      "users/u1": { grille: [{ id: "a" }] },
      "users/u2/conversations/c9": { titre: "autre" },
      "users/u2/usage/2026-11": { total: { appels: 9 } },
    });

  it("conversations : les conversations et leurs messages, rien d'autre", async () => {
    const db = rempli();
    const r = await creerEffacements({ db }).effacer("u1", "conversations");
    expect(r).toEqual({ conversations: 2 });
    expect(db.chemins("users/u1/conversations")).toEqual([]);
    expect(db.chemins("users/u1/prive/cacheIa")).toHaveLength(2);
    expect(db.lire("users/u1/usage/2026-11")).toBeDefined();
    expect(db.lire("users/u1/prive/ia")).toBeDefined();
    expect(db.lire("users/u1/sauvegardes/s1")).toBeDefined();
  });
  it("cache : seulement le cache ; les clés et le quota restent", async () => {
    const db = rempli();
    expect(await creerEffacements({ db }).effacer("u1", "cache")).toEqual({ cache: 2 });
    expect(db.chemins("users/u1/prive/cacheIa")).toEqual([]);
    expect(db.lire("users/u1/prive/ia")).toBeDefined();
    expect(db.lire("users/u1/prive/quota")).toBeDefined();
    expect(db.chemins("users/u1/conversations").length).toBeGreaterThan(0);
  });
  it("usage : seulement les statistiques", async () => {
    const db = rempli();
    expect(await creerEffacements({ db }).effacer("u1", "usage")).toEqual({ usage: 1 });
    expect(db.lire("users/u1/usage/2026-11")).toBeUndefined();
    expect(db.lire("users/u1/prive/quota")).toBeDefined();
  });
  it("serveur : les trois ; la grille, les sauvegardes, les clés et les autres utilisateurs intacts", async () => {
    const db = rempli();
    await creerEffacements({ db }).effacer("u1", "serveur");
    expect(db.chemins("users/u1/conversations")).toEqual([]);
    expect(db.chemins("users/u1/prive/cacheIa")).toEqual([]);
    expect(db.lire("users/u1/usage/2026-11")).toBeUndefined();
    expect(db.lire("users/u1").grille).toEqual([{ id: "a" }]);
    expect(db.lire("users/u1/sauvegardes/s1")).toBeDefined();
    expect(db.lire("users/u1/prive/ia")).toBeDefined();
    expect(db.lire("users/u2/conversations/c9")).toBeDefined();
    expect(db.lire("users/u2/usage/2026-11")).toBeDefined();
  });
  it("fonction iaEffacer : valeur inconnue refusée, un autre utilisateur n'est pas touché", async () => {
    const { ia, db } = await monter();
    await db.doc("users/u2/usage/2026-11").set({ total: { appels: 9 } });
    await expect(ia.effacer("u1", { quoi: "tout-le-compte" })).rejects.toThrow();
    await expect(ia.effacer("u1", {})).rejects.toThrow();
    await ia.effacer("u1", { quoi: "serveur" });
    expect(db.lire("users/u2/usage/2026-11")).toBeDefined();
    expect(db.chemins(`users/u1/conversations`)).toEqual([]);
  });
});
