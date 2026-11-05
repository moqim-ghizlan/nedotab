import { el } from "../dom.js";
import { rapatrierToasts } from "../toast.js";

/**
 * "Choisir des sites" (T3): a window with a search field, a compact list in a fixed-height
 * box, "Tout sélectionner / Aucun", a counter and a sticky "Ajouter (n)" button. Domains
 * already in the list are greyed ("Déjà ajouté"). Resolves to the chosen domains, or null.
 *
 * @param {{ domaines: string[], dejaAjoutes?: string[], retourFocus?: HTMLElement }} p
 */
export function choisirSites({ domaines, dejaAjoutes = [], retourFocus }) {
  return new Promise((resolve) => {
    const deja = new Set(dejaAjoutes);
    const tous = [...new Set(domaines)].sort((a, b) => a.localeCompare(b));
    const coches = new Set();
    let recherche = "";
    let valeur = null;

    const champ = el("input", {
      type: "search",
      class: "champ-texte",
      placeholder: "Rechercher un site",
      "aria-label": "Rechercher un site",
      autocomplete: "off",
      spellcheck: "false",
    });
    const liste = el("ul", {
      class: "choix-sites-liste",
      role: "listbox",
      "aria-multiselectable": "true",
    });
    const compteur = el("p", { class: "choix-sites-compteur", "aria-live": "polite" });
    const ajouter = el("button", { type: "submit", class: "bouton bouton--principal" });
    const vide = el("p", { class: "reglages-note", texte: "Aucun site ne correspond." });

    const visibles = () => tous.filter((d) => d.includes(recherche.trim().toLowerCase()));
    const majPied = () => {
      compteur.textContent = `${coches.size} sélectionné${coches.size > 1 ? "s" : ""}`;
      ajouter.textContent = coches.size ? `Ajouter (${coches.size})` : "Ajouter";
      ajouter.disabled = coches.size === 0;
    };
    const dessiner = () => {
      const v = visibles();
      liste.replaceChildren(
        ...v.map((d) => {
          const pris = deja.has(d);
          const c = el("input", {
            type: "checkbox",
            "aria-label": d,
            checked: coches.has(d) || pris,
            disabled: pris || null,
            onchange: () => {
              if (c.checked) coches.add(d);
              else coches.delete(d);
              majPied();
            },
          });
          return el(
            "li",
            { class: `choix-sites-ligne${pris ? " choix-sites-ligne--deja" : ""}`, role: "option" },
            el(
              "label",
              {},
              c,
              // A letter, not the favicon: no request is sent to the sites of the grid.
              el("span", {
                class: "choix-sites-icone",
                "aria-hidden": "true",
                texte: d[0].toUpperCase(),
              }),
              el("span", { class: "choix-sites-domaine", texte: d }),
              pris ? el("small", { texte: "Déjà ajouté" }) : null,
            ),
          );
        }),
      );
      vide.hidden = v.length > 0;
    };
    champ.addEventListener("input", () => {
      recherche = champ.value;
      dessiner();
    });

    const selectionner = (tout) => {
      for (const d of visibles()) {
        if (deja.has(d)) continue;
        if (tout) coches.add(d);
        else coches.delete(d);
      }
      dessiner();
      majPied();
    };

    const dialogue = el(
      "dialog",
      { class: "dialogue dialogue--sites", "aria-labelledby": "choix-sites-titre" },
      el(
        "form",
        { method: "dialog", novalidate: true, class: "formulaire" },
        el("h2", { id: "choix-sites-titre", class: "dialogue-titre", texte: "Choisir des sites" }),
        champ,
        el(
          "div",
          { class: "choix-sites-outils" },
          el("button", {
            type: "button",
            class: "lien-discret",
            texte: "Tout sélectionner",
            onclick: () => selectionner(true),
          }),
          el("button", {
            type: "button",
            class: "lien-discret",
            texte: "Aucun",
            onclick: () => selectionner(false),
          }),
          compteur,
        ),
        liste,
        vide,
        el(
          "div",
          { class: "dialogue-actions choix-sites-pied" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Annuler",
            onclick: () => dialogue.close(),
          }),
          ajouter,
        ),
      ),
    );
    dialogue.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      valeur = coches.size ? [...coches] : null;
      dialogue.close();
    });
    dialogue.addEventListener("close", () => {
      rapatrierToasts();
      dialogue.remove();
      retourFocus?.focus();
      resolve(valeur);
    });
    dessiner();
    majPied();
    (document.querySelector("dialog[open]") ?? document.body).append(dialogue);
    dialogue.showModal();
    champ.focus();
  });
}
