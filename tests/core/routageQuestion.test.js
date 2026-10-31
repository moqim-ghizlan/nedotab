import { describe, expect, it } from "vitest";
import {
  decider,
  decisionLocale,
  intentionValide,
  motsUtiles,
  validerPreference,
} from "../../src/core/routageQuestion.js";
import { indexer } from "../../src/core/recherche.js";

const site = (id, titre, url, tags = [], description = "") => ({
  id,
  type: "site",
  titre,
  url,
  tags,
  description,
  creeLe: 0,
});
const dossier = (id, titre, items) => ({ id, type: "dossier", titre, items, creeLe: 0 });

const INDEX = indexer([
  site(
    "fac",
    "Facture Express",
    "https://facture.exemple.fr",
    ["factures", "gestion"],
    "Créer et envoyer des factures",
  ),
  site("pix", "Pixlr", "https://pixlr.com", ["photo", "image"], "Retoucher des photos en ligne"),
  site("rec", "Marmiton", "https://marmiton.org", ["recettes", "cuisine"], "Recettes de cuisine"),
  site("gh", "GitHub", "https://github.com", ["code"], "Hébergement de code avec Git"),
  dossier("travail", "Travail", [site("crm", "Mon CRM", "https://crm.exemple.fr", ["clients"])]),
]);

// [question, décision attendue]
const JEU = [
  // questions générales → chat direct
  ["comment faire une pâte brisée", "chat"],
  ["Pourquoi le ciel est bleu ?", "chat"],
  ["qu'est-ce que le DNS", "chat"],
  ["Explique-moi la récursivité", "chat"],
  ["écris un mail pour demander un congé", "chat"],
  ["traduis « bonne nuit » en japonais", "chat"],
  ["calcule 15 % de 240", "chat"],
  ["quelle heure est-il à Tokyo ?", "chat"],
  ["c'est quoi une API", "chat"],
  ["combien de jours avant Noël", "chat"],
  ["comment faire une facture", "chat"], // verb first: the chat, even if "facture" is a tag
  // recherche de ses sites → site
  ["mon outil de facture", "site"],
  ["mes sites de recettes", "site"],
  ["où est mon CRM", "site"],
  ["le site que j'ai ajouté le mois dernier", "site"],
  ["l'outil pour retoucher des photos", "site"],
  ["montre-moi mes sites de code", "site"],
  ["dans mon dossier travail", "site"],
  ["quel site pour mes factures", "site"],
  // les deux ou doute → le modèle décide
  ["quel site j'utilise pour les factures et comment en faire une", "incertain"],
  ["recettes de cuisine", "incertain"],
  ["retoucher des fotos", "incertain"], // typo, but "retoucher" is known: the model decides
  ["gestion clients", "incertain"],
  ["photo", "incertain"],
  // aucun mot dans les sites → chat
  ["un jeu de plateau pour ce soir", "chat"],
  ["météo demain", "chat"],
];

describe("decisionLocale (V4.13)", () => {
  it.each(JEU)("« %s » → %s", (question, attendu) => {
    expect(decisionLocale(question, INDEX).vers).toBe(attendu);
  });

  it("jeu d'essai : au moins 85 % de décisions attendues", () => {
    const bon = JEU.filter(([q, v]) => decisionLocale(q, INDEX).vers === v).length;
    expect(bon / JEU.length).toBeGreaterThanOrEqual(0.85);
  });

  it("aucun site : tout va au chat, sauf les marqueurs explicites de site", () => {
    const vide = indexer([]);
    expect(decisionLocale("recettes de cuisine", vide).vers).toBe("chat");
    expect(decisionLocale("mes sites de recettes", vide).vers).toBe("site");
  });

  it("pluriel et singulier : « factures » trouve le tag « facture »", () => {
    const index = indexer([site("f", "Compta", "https://c.fr", ["facture"])]);
    expect(decisionLocale("mes factures du mois", index).vers).toBe("incertain");
  });

  it("question vide ou de mots vides : chat", () => {
    expect(decisionLocale("   ", INDEX).vers).toBe("chat");
    expect(decisionLocale("et le de la", INDEX).vers).toBe("chat");
  });
});

describe("decider : la préférence passe avant les règles", () => {
  it("sites : jamais le chat, même pour « comment… »", () => {
    expect(decider("comment faire une facture", { preference: "sites", index: INDEX }).vers).toBe(
      "site",
    );
  });
  it("chat : toujours le chat, même pour « mes sites »", () => {
    expect(decider("mes sites de recettes", { preference: "chat", index: INDEX })).toEqual({
      vers: "chat",
      motif: "preference",
    });
  });
  it("auto ou valeur inconnue : les règles", () => {
    expect(decider("mon outil de facture", { preference: "auto", index: INDEX }).vers).toBe("site");
    expect(decider("mon outil de facture", { preference: "bizarre", index: INDEX }).vers).toBe(
      "site",
    );
  });
});

describe("aides", () => {
  it("validerPreference", () => {
    expect(validerPreference("chat")).toBe("chat");
    expect(validerPreference("x")).toBe("auto");
    expect(validerPreference(undefined)).toBe("auto");
  });
  it("intentionValide : valeur inconnue → site", () => {
    expect(intentionValide("question")).toBe("question");
    expect(intentionValide("les_deux")).toBe("les_deux");
    expect(intentionValide("n'importe quoi")).toBe("site");
    expect(intentionValide(undefined)).toBe("site");
  });
  it("motsUtiles : sans mots vides, accents retirés", () => {
    expect(motsUtiles("Où est l'outil de gestion ?")).toEqual(["outil", "gestion"]);
  });
});
