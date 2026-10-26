import { afterEach, describe, expect, it, vi } from "vitest";
import { creerChampTags } from "../../src/ui/champTags.js";

afterEach(() => document.body.replaceChildren());

function monter(options = {}) {
  const onChange = vi.fn();
  const champ = creerChampTags({ onChange, ...options });
  document.body.append(champ.racine);
  return { ...champ, onChange };
}
const saisir = (champ, texte) => {
  champ.champ.value = texte;
  champ.champ.dispatchEvent(new Event("input", { bubbles: true }));
};
const touche = (champ, key) => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  champ.champ.dispatchEvent(e);
  return e;
};

describe("champ de tags", () => {
  it("Entrée valide le tag tapé (nettoyé) et vide le champ", () => {
    const c = monter();
    saisir(c, "  #Jeux Vidéo ");
    const e = touche(c, "Enter");
    expect(e.defaultPrevented).toBe(true);
    expect(c.lire()).toEqual(["jeux vidéo"]);
    expect(c.champ.value).toBe("");
    expect(c.onChange).toHaveBeenCalledTimes(1);
  });

  it("Entrée dans un champ vide n'est pas retenue : le formulaire peut s'envoyer", () => {
    const c = monter();
    expect(touche(c, "Enter").defaultPrevented).toBe(false);
    expect(c.lire()).toEqual([]);
  });

  it("la virgule valide aussi, sans écrire la virgule", () => {
    const c = monter();
    saisir(c, "musique");
    touche(c, ",");
    expect(c.lire()).toEqual(["musique"]);
  });

  it("une liste collée est découpée en tags", () => {
    const c = monter();
    saisir(c, "a, b; #c, A");
    expect(c.lire()).toEqual(["a", "b", "c"]);
  });

  it("× retire le tag ; Retour arrière dans un champ vide retire le dernier", () => {
    const c = monter({ tags: ["un", "deux", "trois"] });
    c.racine.querySelector('button[aria-label="Retirer le tag deux"]').click();
    expect(c.lire()).toEqual(["un", "trois"]);
    touche(c, "Backspace");
    expect(c.lire()).toEqual(["un"]);
    saisir(c, "x");
    touche(c, "Backspace");
    expect(c.lire()).toEqual(["un"]);
  });

  it("10 tags au plus : le champ disparaît, le message le dit", () => {
    const c = monter({ tags: Array.from({ length: 9 }, (_, i) => `t${i}`) });
    saisir(c, "dernier");
    touche(c, "Enter");
    expect(c.lire()).toHaveLength(10);
    expect(c.champ.hidden).toBe(true);
    expect(c.racine.textContent).toContain("maximum");
    c.racine.querySelector(".tag-retirer").click();
    expect(c.champ.hidden).toBe(false);
  });

  it("un doublon (accents et casse ignorés) n'est pas ajouté", () => {
    const c = monter({ tags: ["café"] });
    saisir(c, "CAFE");
    touche(c, "Enter");
    expect(c.lire()).toEqual(["café"]);
    expect(c.onChange).not.toHaveBeenCalled();
  });

  it("suggestions : les tags déjà utilisés ailleurs, sans ceux déjà choisis", () => {
    const c = monter({ tags: ["a"], suggestions: () => ["a", "b", "c"] });
    const options = [...c.racine.querySelectorAll("datalist option")].map((o) => o.value);
    expect(options).toEqual(["b", "c"]);
    expect(c.champ.getAttribute("list")).toBe(c.racine.querySelector("datalist").id);
  });

  it("quitter le champ valide ce qui est tapé", () => {
    const c = monter();
    saisir(c, "reste");
    c.champ.dispatchEvent(new Event("blur"));
    expect(c.lire()).toEqual(["reste"]);
  });

  it("le texte est écrit comme texte, jamais comme HTML", () => {
    const c = monter();
    saisir(c, "<img src=x onerror=alert(1)>");
    touche(c, "Enter");
    expect(c.racine.querySelector("img")).toBeNull();
    expect(c.racine.querySelector(".tag-puce span").textContent).toContain("<img");
  });
});
