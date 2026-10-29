import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerRecherche } from "../../src/ui/recherche.js";

const site = (id, titre, url, tags = [], description = "") => ({
  id,
  type: "site",
  titre,
  url,
  creeLe: 0,
  tags,
  description,
});

const GRILLE = [
  site("pix", "Pixlr", "https://pixlr.com", ["retouche photo", "dev"], "Éditeur en ligne"),
  site("gh", "GitHub", "https://github.com", ["dev", "git"]),
  site("ed", "Éditeur", "https://editeur.fr", [], "Un outil pour retoucher des photos"),
];

function monter() {
  document.body.replaceChildren();
  const store = { lire: () => ({ grille: GRILLE, reglages: {} }), abonner: () => {} };
  const { racine, champ } = creerRecherche(store, { ouvrirDossier: () => {} });
  document.body.append(racine);
  const taper = (texte) => {
    champ.value = texte;
    champ.dispatchEvent(new Event("input"));
  };
  const lignes = () => [...racine.querySelectorAll("li.resultat")];
  return { champ, taper, lignes, racine };
}

describe("barre de recherche : tags et description (V4.7)", () => {
  let m;
  beforeEach(() => {
    m = monter();
  });

  it("mot présent seulement dans un tag : trouvé, raison « tag : … » en évidence", () => {
    m.taper("retouche");
    const li = m.lignes().find((l) => l.textContent.includes("Pixlr"));
    const raison = li.querySelector(".resultat-raison");
    expect(raison.textContent).toBe("tag : retouche photo");
    expect(raison.querySelector("mark").textContent).toBe("retouche");
  });

  it("mot présent dans la description : extrait avec le mot en évidence", () => {
    m.taper("retoucher");
    const raison = m.lignes()[0].querySelector(".resultat-raison");
    expect(raison.textContent).toContain("retoucher des photos");
    expect(raison.querySelector("mark").textContent).toBe("retoucher");
  });

  it("pas de raison quand c'est le titre qui correspond", () => {
    m.taper("github");
    expect(m.lignes()[0].querySelector(".resultat-raison")).toBeNull();
  });

  it("« # » : tags proposés, le plus utilisé d'abord, sans recherche web", () => {
    m.taper("#");
    const lignes = m.lignes();
    expect(lignes.every((l) => l.classList.contains("resultat--tag"))).toBe(true);
    expect(lignes[0].textContent).toBe("#dev");
    expect(m.racine.querySelector(".resultat--web")).toBeNull();
  });

  it("clic sur un tag proposé : le filtre est appliqué", () => {
    m.taper("#");
    m.lignes()[0].click();
    expect(m.champ.value).toBe("#dev ");
    const titres = m.lignes().filter((l) => l.classList.contains("resultat--site"));
    expect(titres.map((l) => l.querySelector(".resultat-titre").textContent).sort()).toEqual([
      "GitHub",
      "Pixlr",
    ]);
  });

  it("autocomplétion après # : « #gi » propose « git »", () => {
    m.taper("#gi");
    expect(
      m.lignes().some((l) => l.classList.contains("resultat--tag") && l.textContent === "#git"),
    ).toBe(true);
  });
});

describe("barre à deux modes (V4.8)", () => {
  const PRETE = {
    ia: { actif: true },
    modeCompte: true,
    enLigne: true,
    cles: [{ fournisseur: "gemini", valide: true }],
  };

  let reponseIa = { resultats: [] };

  async function monterModes(contexte = PRETE, extra = {}) {
    document.body.replaceChildren();
    const store = { lire: () => ({ grille: GRILLE, reglages: {} }), abonner: () => {} };
    const questions = [];
    const reglagesIa = [];
    const { racine, champ } = creerRecherche(store, {
      ouvrirDossier: () => {},
      contexteIa: async () => contexte,
      ouvrirReglagesIa: () => reglagesIa.push(1),
      demanderIa: async (q) => {
        questions.push(q);
        return reponseIa;
      },
      ...extra,
    });
    document.body.append(racine);
    await Promise.resolve();
    await Promise.resolve();
    const touche = (key, init = {}) => {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      champ.dispatchEvent(e);
      return e;
    };
    const taper = (texte) => {
      champ.value = texte;
      champ.dispatchEvent(new Event("input"));
    };
    return {
      racine,
      champ,
      touche,
      taper,
      questions,
      reglagesIa,
      selecteur: () => racine.querySelector(".mode-selecteur"),
      lignes: () => [...racine.querySelectorAll("li.resultat")],
      demander: () => racine.classList.contains("recherche--demander"),
    };
  }

  it("IA prête : sélecteur (radiogroup) affiché, mode Rechercher au départ", async () => {
    const m = await monterModes();
    expect(m.selecteur().hidden).toBe(false);
    expect(m.selecteur().getAttribute("role")).toBe("radiogroup");
    expect(m.demander()).toBe(false);
    expect(m.champ.getAttribute("enterkeyhint")).toBe("search");
  });

  it.each([
    ["désactivée", { ...PRETE, ia: { actif: false } }],
    ["mode local", { ...PRETE, modeCompte: false }],
  ])("IA %s : aucune trace, « ? » et Ctrl+J ne font rien", async (_, contexte) => {
    const m = await monterModes(contexte);
    expect(m.selecteur().hidden).toBe(true);
    m.taper("?");
    expect(m.demander()).toBe(false);
    expect(m.champ.value).toBe("?");
    m.champ.value = "";
    m.touche("j", { ctrlKey: true });
    expect(m.demander()).toBe(false);
  });

  it("« ? » en premier caractère → mode question, « ? » retiré ; Retour arrière → recherche", async () => {
    const m = await monterModes();
    m.taper("?");
    expect(m.demander()).toBe(true);
    expect(m.champ.value).toBe("");
    expect(m.champ.getAttribute("enterkeyhint")).toBe("send");
    expect(m.champ.placeholder).toContain("Posez une question");
    m.touche("Backspace");
    expect(m.demander()).toBe(false);
    expect(m.racine.querySelector(".visuellement-cache").textContent).toBe("Mode recherche");
  });

  it("Tab (champ vide) et Ctrl+J basculent ; Tab dans un champ rempli ne fait rien", async () => {
    const m = await monterModes();
    expect(m.touche("Tab").defaultPrevented).toBe(true);
    expect(m.demander()).toBe(true);
    expect(m.racine.querySelector(".visuellement-cache").textContent).toBe("Mode question");
    m.touche("j", { ctrlKey: true });
    expect(m.demander()).toBe(false);
    m.taper("git");
    expect(m.touche("Tab").defaultPrevented).toBe(false);
    expect(m.demander()).toBe(false);
  });

  it("clic sur le sélecteur", async () => {
    const m = await monterModes();
    m.racine.querySelector(".mode-bouton--demander").click();
    expect(m.demander()).toBe(true);
    expect(m.racine.querySelector(".mode-bouton--demander").getAttribute("aria-checked")).toBe(
      "true",
    );
    m.racine.querySelector(".mode-bouton--rechercher").click();
    expect(m.demander()).toBe(false);
  });

  it("mode question : 3 exemples locaux, pas de résultats instantanés, Entrée envoie", async () => {
    const m = await monterModes();
    m.touche("Tab");
    expect(m.lignes().filter((l) => l.classList.contains("resultat--exemple"))).toHaveLength(3);
    m.taper("git");
    expect(m.lignes().map((l) => l.className)).toEqual(["resultat resultat--envoyer"]);
    m.touche("Enter");
    expect(m.questions).toEqual(["git"]);
  });

  it("clic sur un exemple : rempli dans le champ, sans envoi", async () => {
    const m = await monterModes();
    m.touche("Tab");
    m.lignes()[0].click();
    expect(m.champ.value).not.toBe("");
    expect(m.questions).toEqual([]);
  });

  it("500 caractères au plus, compteur à partir de 400", async () => {
    const m = await monterModes();
    m.touche("Tab");
    expect(m.champ.getAttribute("maxlength")).toBe("500");
    m.taper("a".repeat(399));
    expect(m.racine.querySelector(".recherche-compteur").hidden).toBe(true);
    m.taper("a".repeat(400));
    expect(m.racine.querySelector(".recherche-compteur").textContent).toBe("400/500");
  });

  it("sans clé : message avec lien vers les réglages, rien n'est envoyé", async () => {
    const m = await monterModes({ ...PRETE, cles: [] });
    m.touche("Tab");
    expect(m.lignes()[0].textContent).toContain("Configurez l'assistant IA");
    m.lignes()[0].click();
    expect(m.reglagesIa).toHaveLength(1);
    expect(m.questions).toEqual([]);
  });

  it("hors ligne : message, Entrée n'envoie rien", async () => {
    const m = await monterModes({ ...PRETE, enLigne: false });
    m.touche("Tab");
    m.taper("une question");
    expect(m.lignes()[0].textContent).toContain("Connexion Internet nécessaire");
    m.touche("Enter");
    expect(m.questions).toEqual([]);
    expect(m.reglagesIa).toEqual([]);
  });
  const titres = (m) =>
    m
      .lignes()
      .filter((l) => l.classList.contains("resultat--site"))
      .map((l) => l.querySelector(".resultat-titre").textContent);
  const entete = (m) => m.racine.querySelector(".resultat-entete")?.textContent;

  async function demander(m, question) {
    m.touche("Tab");
    m.taper(question);
    m.touche("Enter");
    await vi.waitFor(() => expect(m.racine.querySelector(".resultat--attente")).toBeNull());
  }

  it("V4.9 : résultats de l'assistant dans la même liste, dans l'ordre du serveur", async () => {
    reponseIa = {
      resultats: [
        { id: "gh", score: 0.9 },
        { id: "pix", score: 0.5 },
      ],
    };
    const m = await monterModes();
    await demander(m, "où est mon code ?");
    expect(entete(m)).toBe("Résultats de l'assistant");
    expect(titres(m)).toEqual(["GitHub", "Pixlr"]);
    expect(m.lignes().at(-1).classList.contains("resultat--web")).toBe(true);
  });

  it("V4.9 : un site supprimé entre la question et la réponse est ignoré", async () => {
    reponseIa = { resultats: [{ id: "disparu" }, { id: "ed" }] };
    const m = await monterModes();
    await demander(m, "photos");
    expect(titres(m)).toEqual(["Éditeur"]);
  });

  it("V4.9 : aucun résultat → message + recherche web", async () => {
    reponseIa = { resultats: [], aucunResultat: true };
    const m = await monterModes();
    await demander(m, "heure à Tokyo");
    expect(m.lignes()[0].textContent).toContain("Aucun de vos sites ne correspond");
    expect(m.lignes()[1].classList.contains("resultat--web")).toBe(true);
  });

  it("V4.9 : erreur → message court et repli sur la recherche locale", async () => {
    const m = await monterModes(PRETE, {
      demanderIa: async () => Promise.reject({ code: "functions/unavailable" }),
    });
    await demander(m, "github");
    expect(m.lignes()[0].textContent).toContain("Service indisponible");
    expect(entete(m)).toBe("Voici les résultats de la recherche simple");
    expect(titres(m)).toEqual(["GitHub"]);
  });

  it("V4.9 : chargement visible, Annuler ignore la réponse tardive", async () => {
    let finir;
    const m = await monterModes(PRETE, {
      demanderIa: () => new Promise((r) => (finir = r)),
    });
    m.touche("Tab");
    m.taper("code");
    m.touche("Enter");
    expect(m.lignes()[0].textContent).toContain("Recherche dans vos sites…");
    const annuler = m.lignes().find((l) => l.classList.contains("resultat--annuler"));
    annuler.click();
    finir({ resultats: [{ id: "gh" }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(titres(m)).toEqual([]);
    expect(m.racine.querySelector(".resultat--attente")).toBeNull();
  });

  it("V4.9 : la dernière question reste disponible dans la session", async () => {
    reponseIa = { resultats: [{ id: "gh" }] };
    const m = await monterModes();
    await demander(m, "code");
    m.touche("Escape"); // clears the field
    expect(m.champ.value).toBe("");
    expect(entete(m)).toBe("Dernière question : « code »");
    expect(titres(m)).toEqual(["GitHub"]);
  });

  it("V4.9 : un texte modifié après la réponse redevient « Envoyer »", async () => {
    reponseIa = { resultats: [{ id: "gh" }] };
    const m = await monterModes();
    await demander(m, "code");
    m.taper("code git");
    expect(m.lignes().map((l) => l.className)).toEqual(["resultat resultat--envoyer"]);
  });
});
