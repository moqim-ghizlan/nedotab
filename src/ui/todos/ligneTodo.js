import { libelleEcheance, statutEcheance } from "../../core/echeances.js";
import { segmenterSurbrillance } from "../../core/rechercheTodos.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { vibrer } from "../haptique.js";

/** Title shown for a todo with no title (a draft). */
export const SANS_TITRE = "Sans titre";

/** Writes `texte` into `noeud`, the words of the search wrapped in `mark` (nodes, never HTML). */
function ecrireTitre(noeud, texte, requete) {
  const segments = segmenterSurbrillance(texte, requete);
  if (segments.length === 1 && !segments[0].marque) {
    noeud.textContent = texte;
    return;
  }
  noeud.replaceChildren(
    ...segments.map((s) => (s.marque ? el("mark", { texte: s.texte }) : document.createTextNode(s.texte))),
  );
}

/**
 * One line of a todo (V6.2): round box on the left (44 px target), title on one line, due date as
 * a small pill, grip and "⋯". Everything the user wrote goes through textContent. The line is
 * built once and updated in place (`maj`): the focus and a drag are never lost on a snapshot.
 *
 * The pill always says it in words ("En retard de 2 jours", "Demain"); an overdue one also
 * carries an icon: the colour never carries the meaning alone (V6.5).
 *
 * @param {object} d
 * @param {(id: string) => void} d.onCocher
 * @param {(id: string) => void} d.onOuvrir
 * @param {(id: string, bouton: HTMLElement) => void} d.onMenu
 * @param {import("../../core/store.js").Store} [d.store] for the light haptic feedback
 * @param {() => string} [d.requete] the search in progress (highlighted in the title)
 * @param {(todo: object) => string} [d.sujetDe] name of the subject, shown small when given
 * @param {boolean} [d.poignee] a grip to reorder (manual order of a subject only)
 */
export function creerLigneTodo({
  todo,
  onCocher,
  onOuvrir,
  onMenu,
  store,
  requete = () => "",
  sujetDe = null,
  poignee: avecPoignee = true,
}) {
  const case_ = el(
    "button",
    {
      type: "button",
      class: "todo-case",
      role: "checkbox",
      "aria-checked": "false",
      onclick: () => {
        if (store) vibrer(store, 8);
        onCocher(todo.id);
      },
    },
    icone("coche", { taille: 16 }),
  );
  const titre = el("span", { class: "todo-titre" });
  const sujet = el("span", { class: "todo-sujet-nom", hidden: true });
  const date = el("span", { class: "todo-date", hidden: true });
  const corps = el(
    "button",
    { type: "button", class: "todo-corps", onclick: () => onOuvrir(todo.id) },
    el("span", { class: "todo-textes" }, titre, sujet),
    date,
  );
  const poignee = avecPoignee
    ? el(
        "button",
        {
          type: "button",
          class: "todos-poignee todo-poignee",
          "aria-label": "Déplacer le todo (flèches haut et bas)",
          title: "Glisser pour déplacer",
        },
        icone("poignee", { taille: 18 }),
      )
    : null;
  const plus = el(
    "button",
    { type: "button", class: "todos-plus", "aria-haspopup": "menu", title: "Actions du todo" },
    icone("points", { taille: 18 }),
  );
  plus.addEventListener("click", () => onMenu(todo.id, plus));
  const li = el("li", { class: "todo-ligne", dataset: { id: todo.id } }, case_, corps, poignee, plus);
  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    onMenu(todo.id, null, e);
  });

  function maj(t) {
    const nom = t.titre || SANS_TITRE;
    ecrireTitre(titre, nom, t.titre ? requete() : "");
    titre.classList.toggle("todo-titre--brouillon", !t.titre);
    li.classList.toggle("todo-ligne--faite", !!t.fait);
    li.classList.toggle("todo-ligne--attente", !!t.enAttente);
    case_.setAttribute("aria-checked", String(!!t.fait));
    case_.setAttribute("aria-label", `${t.fait ? "Rouvrir" : "Terminer"} : ${nom}`);
    corps.setAttribute("aria-label", `Ouvrir : ${nom}`);
    plus.setAttribute("aria-label", `Actions : ${nom}`);
    const nomSujet = sujetDe?.(t) ?? "";
    sujet.textContent = nomSujet;
    sujet.hidden = !nomSujet;
    const texte = t.echeance ? libelleEcheance(t.echeance) : "";
    const statut = t.fait ? "aucune" : statutEcheance(t.echeance);
    date.replaceChildren(
      ...(statut === "retard" ? [icone("horloge", { taille: 12 })] : []),
      document.createTextNode(texte),
    );
    date.dataset.statut = statut;
    date.hidden = !texte;
  }
  maj(todo);

  return { li, maj, case_, corps, poignee, plus, id: todo.id };
}
