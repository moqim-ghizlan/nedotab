import { afterEach, describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { creerSite, etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { ouvrirEditionSite } from "../../src/ui/dialogues/dialogueSite.js";

afterEach(() => document.body.replaceChildren());

function ouvrir(extra = {}) {
  const site = { ...creerSite({ titre: "Alpha", url: "https://alpha.fr" }, () => "a"), ...extra };
  const autre = {
    ...creerSite({ titre: "Beta", url: "https://beta.fr" }, () => "b"),
    tags: ["musique", "jeux"],
  };
  const store = creerStore({ ...etatInitial(), grille: [site, autre] }, reduire);
  const dialogue = ouvrirEditionSite(store, site);
  return { store, dialogue, site: () => store.lire().grille[0] };
}
const valider = (dialogue) =>
  dialogue.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
const saisir = (el, texte) => {
  el.value = texte;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Modifier le site : tags et description (V4.2)", () => {
  it("enregistre les tags et la description, et marque le site « à la main »", () => {
    const { dialogue, site } = ouvrir();
    const champTags = dialogue.querySelector(".tags-saisie");
    saisir(champTags, "Cuisine, #Recettes");
    saisir(dialogue.querySelector("#edition-description"), "  Des   recettes.  ");
    valider(dialogue);
    expect(site()).toMatchObject({
      tags: ["cuisine", "recettes"],
      description: "Des recettes.",
      tagsManuels: true,
    });
  });

  it("changer seulement le nom ne marque PAS le site « à la main »", () => {
    const { dialogue, site } = ouvrir();
    saisir(dialogue.querySelector("#edition-titre"), "Alpha 2");
    valider(dialogue);
    expect(site()).toMatchObject({ titre: "Alpha 2", tagsManuels: false, tags: [] });
  });

  it("le compteur suit la description", () => {
    const { dialogue } = ouvrir();
    saisir(dialogue.querySelector("#edition-description"), "x".repeat(120));
    expect(dialogue.querySelector("#edition-description-compteur").textContent).toBe("120 / 300");
  });

  it("propose les tags déjà utilisés ailleurs dans la grille", () => {
    const { dialogue } = ouvrir();
    const options = [...dialogue.querySelectorAll("datalist option")].map((o) => o.value);
    expect(options).toEqual(["jeux", "musique"]);
  });

  it("site écrit à la main : « Laisser l'IA gérer » rend la main sans toucher aux tags", () => {
    const { dialogue, site } = ouvrir({ tags: ["perso"], tagsManuels: true });
    const caseIa = dialogue.querySelector("#edition-laisser-ia");
    expect(caseIa).not.toBeNull();
    caseIa.checked = true;
    valider(dialogue);
    expect(site()).toMatchObject({ tagsManuels: false, tags: ["perso"] });
  });

  it("pas de case « Laisser l'IA gérer » quand rien n'a été écrit à la main", () => {
    const { dialogue } = ouvrir();
    expect(dialogue.querySelector("#edition-laisser-ia")).toBeNull();
  });

  it("proposé par l'IA : mention et bouton « Régénérer » actif (V4.4)", () => {
    const { dialogue } = ouvrir({ tags: ["a"], ia: { etat: "ok", majLe: 5 } });
    expect(dialogue.textContent).toContain("Proposé par l'IA");
    const regenerer = [...dialogue.querySelectorAll("button")].find(
      (b) => b.textContent === "Régénérer",
    );
    expect(regenerer.disabled).toBe(false);
  });

  it("Annuler ne change rien", () => {
    const { dialogue, store } = ouvrir();
    const avant = store.lire().grille;
    saisir(dialogue.querySelector(".tags-saisie"), "x, y");
    [...dialogue.querySelectorAll("button")].find((b) => b.textContent === "Annuler").click();
    expect(store.lire().grille).toBe(avant);
  });

  it("l'action envoyée ne contient que ce qui a changé", () => {
    const { dialogue, store } = ouvrir();
    const envoyees = [];
    const envoyer = store.envoyer;
    store.envoyer = (a) => (envoyees.push(a), envoyer(a));
    saisir(dialogue.querySelector("#edition-description"), "Une description.");
    valider(dialogue);
    const modif = envoyees.find((a) => a.type === A.SITE_MODIFIER);
    expect(modif.changements).toHaveProperty("description", "Une description.");
    expect(modif.changements).not.toHaveProperty("tags");
  });
});
