import { aplatirArbre, filAriane, ouvertsPour } from "../core/aplatirArbre.js";
import { trouver } from "../core/arbre.js";
import { el } from "./dom.js";
import { RAISONS } from "./messages.js";
import { creerIcone } from "./tuile.js";

/** Title with the searched text highlighted (text nodes only, never innerHTML). */
function surligner(titre, filtre) {
  const q = filtre.trim().toLowerCase();
  const i = q ? titre.toLowerCase().indexOf(q) : -1;
  if (i < 0 || titre.toLowerCase().length !== titre.length) return [titre];
  return [
    titre.slice(0, i),
    el("mark", { texte: titre.slice(i, i + q.length) }),
    titre.slice(i + q.length),
  ];
}

let compteur = 0;

/**
 * Folder picker as a tree, used wherever a destination is chosen (T1).
 * - elementId: the element being moved (its own subtree, too-deep places and `actuel`
 *   are disabled, through peutPlacer); null when adding a new site.
 * - onChoix(id): the selection changed (click, Enter, arrows with Enter); onValider(id):
 *   confirmed (double click or Enter on the selected row).
 * - apercu: shows what the clicked (else selected) folder holds, sites and sub-folders
 *   (T2); a sub-folder of the preview can be clicked to select it.
 * Keyboard: ↑ ↓ move, → unfold, ← fold, Enter choose. Unfolded folders are remembered
 * for the life of the component.
 * @returns {{ racine: HTMLElement, lire: () => string|null, definir: (id:string|null) => void,
 *   focus: () => void }}
 */
export function creerSelecteurDossier({
  grille,
  elementId = null,
  actuel,
  selection,
  onChoix = () => {},
  onValider = () => {},
  apercu = false,
}) {
  const idArbre = `selecteur-${++compteur}`;
  let choix = selection;
  let filtre = "";
  const ouverts = ouvertsPour(grille, selection);
  if (actuel) for (const id of ouvertsPour(grille, actuel)) ouverts.add(id);

  const champ = el("input", {
    type: "search",
    class: "selecteur-recherche",
    placeholder: "Chercher un dossier",
    "aria-label": "Chercher un dossier",
    autocomplete: "off",
  });
  const arbre = el("ul", { class: "arbre", role: "tree", id: idArbre, "aria-label": "Dossiers" });
  const ariane = el("nav", { class: "selecteur-ariane", "aria-label": "Destination choisie" });
  const panneau = apercu ? el("div", { class: "selecteur-apercu", "aria-live": "polite" }) : null;
  const racine = el(
    "div",
    { class: `selecteur${apercu ? " selecteur--apercu" : ""}` },
    champ,
    apercu ? el("div", { class: "selecteur-corps" }, arbre, panneau) : arbre,
    ariane,
  );
  let survol; // folder clicked for the preview only (undefined = follow the selection)

  /** Content of the folder shown in the preview panel. */
  function dessinerApercu() {
    if (!panneau) return;
    const id = survol !== undefined ? survol : choix;
    if (id === undefined) {
      panneau.replaceChildren(
        el("p", { class: "selecteur-aide", texte: "Cliquez un dossier pour voir son contenu." }),
      );
      return;
    }
    const dossier = id === null ? null : trouver(grille, id)?.element;
    const items = id === null ? grille : (dossier?.items ?? []);
    panneau.replaceChildren(
      el("h3", { class: "selecteur-apercu-titre", texte: dossier ? dossier.titre : "Accueil" }),
      items.length
        ? el(
            "ul",
            { class: "selecteur-contenu" },
            items.map((e) =>
              e.type === "dossier"
                ? el(
                    "li",
                    {},
                    el(
                      "button",
                      {
                        type: "button",
                        class: "selecteur-sous",
                        title: "Choisir ce dossier",
                        onclick: () => choisirDepuisApercu(e.id),
                      },
                      el("span", { class: "destination-icone", "aria-hidden": "true", texte: "▣" }),
                      el("span", { class: "selecteur-nom", texte: e.titre }),
                      el("span", { class: "selecteur-nb", texte: String(e.items.length) }),
                    ),
                  )
                : el(
                    "li",
                    { class: "selecteur-site" },
                    el("span", { class: "selecteur-icone" }, creerIcone(e)),
                    el("span", { class: "selecteur-nom", texte: e.titre }),
                  ),
            ),
          )
        : el("p", { class: "selecteur-aide", texte: "Ce dossier est vide." }),
    );
  }

  let lignes = [];
  const note = (l) => {
    if (l.raison === "ACTUEL") return "(actuel)";
    if (l.desactive) return RAISONS[l.raison] ?? "";
    return filtre && l.chemin.length > 1 ? l.chemin.slice(0, -1).join(" › ") : "";
  };

  function dessiner(focusId) {
    lignes = aplatirArbre(grille, { ouverts, filtre, exclure: elementId, actuel });
    arbre.replaceChildren(
      ...lignes.map((l) => {
        const n = note(l);
        const racineLigne = l.id === null;
        const li = el(
          "li",
          {
            class: `arbre-noeud${l.id === choix ? " arbre-noeud--choisi" : ""}`,
            role: "treeitem",
            tabindex: l.id === (focusId ?? choix) ? "0" : "-1",
            "aria-level": String(l.niveau + 1),
            "aria-expanded": l.aEnfants ? String(l.ouvert) : null,
            "aria-selected": String(l.id === choix),
            "aria-disabled": l.desactive ? "true" : null,
            title: n && l.desactive ? n : ["Accueil", ...l.chemin].join(" › "),
            dataset: { id: l.id ?? "" },
          },
          ...Array.from({ length: Math.max(0, l.niveau - 1) }, () =>
            el("span", { class: "arbre-guide", "aria-hidden": "true" }),
          ),
          el("span", {
            class: `arbre-fleche${l.aEnfants && !racineLigne ? "" : " arbre-fleche--vide"}`,
            "aria-hidden": "true",
            texte: l.aEnfants && !racineLigne ? (l.ouvert ? "▾" : "▸") : "",
          }),
          el("span", {
            class: "destination-icone",
            "aria-hidden": "true",
            texte: l.id ? "▣" : "⌂",
          }),
          el("span", { class: "arbre-titre" }, ...surligner(l.titre, filtre)),
          n ? el("span", { class: "destination-note", texte: n }) : null,
        );
        return li;
      }),
    );
    if (!arbre.querySelector('[tabindex="0"]'))
      arbre.firstElementChild?.setAttribute("tabindex", "0");
    dessinerApercu();
    ariane.hidden = choix === undefined;
    ariane.replaceChildren(
      ...(choix === undefined ? [] : filAriane(grille, choix)).flatMap((e, i, tout) => [
        el("button", {
          type: "button",
          class: "selecteur-miette",
          texte: e.titre,
          onclick: () => choisir(e.id),
        }),
        ...(i < tout.length - 1
          ? [el("span", { class: "selecteur-sep", "aria-hidden": "true", texte: "›" })]
          : []),
      ]),
    );
  }

  const ligneDe = (id) => lignes.find((l) => l.id === id);
  function choisir(id) {
    const l = ligneDe(id) ?? { id, desactive: false };
    if (l.desactive) return false;
    choix = id;
    survol = undefined;
    for (const a of filAriane(grille, id)) if (a.id) ouverts.add(a.id);
    dessiner(id);
    arbre.querySelector('[tabindex="0"]')?.focus({ preventScroll: false });
    onChoix(id);
    return true;
  }
  function choisirDepuisApercu(id) {
    // The preview shows folders the tree may hide (closed, filtered): open the way first.
    filtre = "";
    champ.value = "";
    for (const a of filAriane(grille, id)) if (a.id) ouverts.add(a.id);
    lignes = aplatirArbre(grille, { ouverts, filtre, exclure: elementId, actuel });
    survol = undefined;
    if (!choisir(id)) dessinerApercu();
  }
  function basculer(id) {
    if (ouverts.has(id)) ouverts.delete(id);
    else ouverts.add(id);
    dessiner(id);
    arbre.querySelector('[tabindex="0"]')?.focus();
  }

  arbre.addEventListener("click", (e) => {
    const li = e.target.closest(".arbre-noeud");
    if (!li) return;
    const id = li.dataset.id || null;
    const l = ligneDe(id);
    if (e.target.closest(".arbre-fleche") && l?.aEnfants && id) return basculer(id);
    // The preview follows the click (not the pointer), so it stays put while the mouse goes
    // to the sub-folders on the right; a disabled folder can still be previewed.
    survol = id;
    if (!choisir(id)) dessinerApercu();
  });
  arbre.addEventListener("dblclick", (e) => {
    const li = e.target.closest(".arbre-noeud");
    if (li && !e.target.closest(".arbre-fleche") && !ligneDe(li.dataset.id || null)?.desactive) {
      onValider(li.dataset.id || null);
    }
  });
  arbre.addEventListener("keydown", (e) => {
    const li = e.target.closest(".arbre-noeud");
    if (!li) return;
    const i = lignes.findIndex((l) => (l.id ?? "") === li.dataset.id);
    const l = lignes[i];
    const aller = (j) => {
      e.preventDefault();
      const cible = arbre.children[j];
      if (!cible) return;
      for (const x of arbre.children) x.setAttribute("tabindex", "-1");
      cible.setAttribute("tabindex", "0");
      cible.focus();
    };
    if (e.key === "ArrowDown") aller(i + 1);
    else if (e.key === "ArrowUp") aller(i - 1);
    else if (e.key === "Home") aller(0);
    else if (e.key === "End") aller(lignes.length - 1);
    else if (e.key === "ArrowRight" && l.aEnfants && l.id) {
      e.preventDefault();
      if (!l.ouvert) basculer(l.id);
      else aller(i + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (l.aEnfants && l.ouvert && l.id) basculer(l.id);
      else {
        const parent = lignes.findLastIndex((x, j) => j < i && x.niveau < l.niveau);
        if (parent >= 0) aller(parent);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (l.id === choix && e.key === "Enter" && !l.desactive) onValider(l.id);
      else choisir(l.id);
    }
  });
  champ.addEventListener("input", () => {
    filtre = champ.value;
    dessiner();
  });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault(); // never submits the surrounding dialog
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (arbre.querySelector('[tabindex="0"]') ?? arbre.firstElementChild)?.focus();
    }
  });

  dessiner();
  return {
    racine,
    lire: () => choix,
    definir: (id) => {
      choix = id;
      for (const x of ouvertsPour(grille, id)) ouverts.add(x);
      dessiner(id);
    },
    focus: () => (arbre.querySelector('[tabindex="0"]') ?? champ).focus(),
  };
}
