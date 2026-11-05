import { formaterEcheanceCourte } from "../../core/echeances.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { vibrer } from "../haptique.js";

/** Title shown for a todo with no title (a draft). */
export const SANS_TITRE = "Sans titre";

/**
 * One line of a todo (V6.2): round box on the left (44 px target), title on one line, due date as
 * a small pill, grip and "⋯". Everything the user wrote goes through textContent. The line is
 * built once and updated in place (`maj`): the focus and a drag are never lost on a snapshot.
 *
 * @param {object} d
 * @param {(id: string) => void} d.onCocher
 * @param {(id: string) => void} d.onOuvrir
 * @param {(id: string, bouton: HTMLElement) => void} d.onMenu
 * @param {import("../../core/store.js").Store} [d.store] for the light haptic feedback
 */
export function creerLigneTodo({ todo, onCocher, onOuvrir, onMenu, store }) {
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
  const date = el("span", { class: "todo-date", hidden: true });
  const corps = el(
    "button",
    { type: "button", class: "todo-corps", onclick: () => onOuvrir(todo.id) },
    titre,
    date,
  );
  const poignee = el(
    "button",
    {
      type: "button",
      class: "todos-poignee todo-poignee",
      "aria-label": "Déplacer le todo (flèches haut et bas)",
      title: "Glisser pour déplacer",
    },
    icone("poignee", { taille: 18 }),
  );
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
    titre.textContent = nom;
    titre.classList.toggle("todo-titre--brouillon", !t.titre);
    li.classList.toggle("todo-ligne--faite", !!t.fait);
    li.classList.toggle("todo-ligne--attente", !!t.enAttente);
    case_.setAttribute("aria-checked", String(!!t.fait));
    case_.setAttribute("aria-label", `${t.fait ? "Rouvrir" : "Terminer"} : ${nom}`);
    corps.setAttribute("aria-label", `Ouvrir : ${nom}`);
    plus.setAttribute("aria-label", `Actions : ${nom}`);
    const texte = t.echeance ? formaterEcheanceCourte(t.echeance) : "";
    date.textContent = texte;
    date.hidden = !texte;
  }
  maj(todo);

  return { li, maj, case_, corps, poignee, plus, id: todo.id };
}
