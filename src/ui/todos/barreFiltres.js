import { FILTRES, TRIS, DELAI_RECHERCHE_MS } from "../../core/rechercheTodos.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";

/**
 * The bar under the add field of a subject (V6.5): search (150 ms after the last key), a filter
 * menu, a sort menu and the button "Tous les sujets". `onChange(etat)` is called with
 * { requete, filtre, tri, portee } where `portee` is "sujet" or "tous". The shortcut `/` puts the
 * focus in the search when the panel is the active one.
 *
 * @param {object} d
 * @param {(etat: { requete: string, filtre: string, tri: string, portee: string }) => void} d.onChange
 */
export function creerBarreFiltres({ onChange }) {
  const etat = { requete: "", filtre: "tous", tri: "manuel", portee: "sujet" };
  let minuteur = null;

  const champ = el("input", {
    type: "search",
    class: "todos-champ todos-recherche",
    placeholder: "Rechercher",
    "aria-label": "Rechercher dans les todos",
    autocomplete: "off",
    enterkeyhint: "search",
  });
  const boutonFiltre = el(
    "button",
    { type: "button", class: "todos-menu-bouton", "aria-haspopup": "menu" },
    icone("filtre", { taille: 16 }),
    el("span", { class: "todos-menu-libelle" }),
  );
  const boutonTri = el(
    "button",
    { type: "button", class: "todos-menu-bouton", "aria-haspopup": "menu" },
    icone("deplacer", { taille: 16 }),
    el("span", { class: "todos-menu-libelle" }),
  );
  const boutonPortee = el("button", {
    type: "button",
    class: "todos-menu-bouton todos-menu-bouton--portee",
    "aria-pressed": "false",
    texte: "Tous les sujets",
  });
  const racine = el(
    "div",
    { class: "todos-barre", role: "search" },
    el("div", { class: "todos-recherche-ligne" }, icone("loupe", { taille: 16 }), champ),
    el("div", { class: "todos-barre-menus" }, boutonFiltre, boutonTri, boutonPortee),
  );

  const libelle = (liste, id) => liste.find((x) => x.id === id)?.libelle ?? "";

  function afficher() {
    boutonFiltre.querySelector(".todos-menu-libelle").textContent = libelle(FILTRES, etat.filtre);
    boutonFiltre.setAttribute("aria-label", `Filtrer : ${libelle(FILTRES, etat.filtre)}`);
    boutonTri.querySelector(".todos-menu-libelle").textContent = libelle(TRIS, etat.tri);
    boutonTri.setAttribute("aria-label", `Trier : ${libelle(TRIS, etat.tri)}`);
    boutonPortee.setAttribute("aria-pressed", String(etat.portee === "tous"));
    boutonPortee.classList.toggle("todos-menu-bouton--actif", etat.portee === "tous");
    // Sorting by hand only makes sense in one subject.
  }

  const changer = (suite) => {
    Object.assign(etat, suite);
    afficher();
    onChange({ ...etat });
  };

  function menu(bouton, liste, cle, titre) {
    const r = bouton.getBoundingClientRect();
    ouvrirMenu({
      x: r.left,
      y: r.bottom + 4,
      libelle: titre,
      retourFocus: bouton,
      entrees: liste.map((x) => ({
        libelle: `${x.id === etat[cle] ? "✓ " : ""}${x.libelle}`,
        onChoix: () => changer({ [cle]: x.id }),
      })),
    });
  }
  boutonFiltre.addEventListener("click", () => menu(boutonFiltre, FILTRES, "filtre", "Filtrer les todos"));
  boutonTri.addEventListener("click", () => menu(boutonTri, TRIS, "tri", "Trier les todos"));
  boutonPortee.addEventListener("click", () => changer({ portee: etat.portee === "tous" ? "sujet" : "tous" }));

  champ.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => changer({ requete: champ.value }), DELAI_RECHERCHE_MS);
  });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && champ.value) {
      // First Escape empties the search; the next one closes the panel.
      e.preventDefault();
      e.stopPropagation();
      champ.value = "";
      clearTimeout(minuteur);
      changer({ requete: "" });
    }
  });

  afficher();
  return {
    racine,
    etat: () => ({ ...etat }),
    focus: () => champ.focus(),
    /** True when something narrows the list (to explain an empty result). */
    actif: () => etat.requete.trim() !== "" || etat.filtre !== "tous",
    liberer: () => clearTimeout(minuteur),
  };
}
