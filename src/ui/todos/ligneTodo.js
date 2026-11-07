import { cheminMini } from "../../core/imagesTodo.js";
import { vibrer } from "../haptique.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";

export const SANS_TITRE = "Sans titre";

/**
 * One todo: a line (tick, title, small picture). A tap on the line asks the list to open the todo
 * in its window (create / edit / delete live there, see modaleTodo.js). Everything the user wrote
 * goes through textContent, never HTML.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {object} d.todo
 * @param {(todo: object, origine: HTMLElement) => void} d.surOuvrir asks the list to open this todo
 * @param {import("../../core/store.js").Store} [d.store]
 */
export function creerLigneTodo({ donnees, todo, surOuvrir, store }) {
  let courant = todo;
  let miniUrl = null;
  let miniChemin = null;

  const case_ = el(
    "button",
    {
      type: "button",
      class: "todo-case",
      role: "checkbox",
      "aria-checked": "false",
      onclick: () => {
        if (store) vibrer(store, 8);
        donnees.cocher(courant.id);
      },
    },
    icone("coche", { taille: 16 }),
  );
  const titre = el("span", { class: "todo-titre" });
  const indices = el("span", { class: "todo-indices", "aria-hidden": "true" });
  const mini = el("img", { class: "todo-mini", alt: "", decoding: "async", hidden: true });
  const corps = el(
    "button",
    { type: "button", class: "todo-corps", "aria-haspopup": "dialog", onclick: () => surOuvrir?.(courant, corps) },
    mini,
    el("span", { class: "todo-textes" }, titre, indices),
    icone("chevron", { taille: 16 }),
  );
  const li = el("li", { class: "todo", dataset: { id: todo.id } }, el("div", { class: "todo-tete" }, case_, corps));

  async function chargerMini(chemin) {
    if (miniChemin === chemin) return;
    miniChemin = chemin;
    if (miniUrl) URL.revokeObjectURL(miniUrl);
    miniUrl = null;
    mini.hidden = true;
    if (!chemin) return;
    try {
      const url = URL.createObjectURL(await donnees.lireImage(chemin));
      if (miniChemin !== chemin) return URL.revokeObjectURL(url); // another picture came meanwhile
      miniUrl = url;
      mini.src = url;
      mini.hidden = false;
    } catch {
      mini.hidden = true;
    }
  }

  function maj(t) {
    courant = t;
    const nom = t.titre || SANS_TITRE;
    titre.textContent = nom;
    titre.classList.toggle("todo-titre--vide", !t.titre);
    indices.textContent = t.description ? t.description.split("\n")[0].slice(0, 90) : "";
    indices.hidden = !t.description;
    li.classList.toggle("todo--faite", !!t.fait);
    li.classList.toggle("todo--attente", !!t.enAttente);
    case_.setAttribute("aria-checked", String(!!t.fait));
    case_.setAttribute("aria-label", `${t.fait ? "Rouvrir" : "Terminer"} : ${nom}`);
    corps.setAttribute("aria-label", `Ouvrir le todo : ${nom}`);
    const image = t.images[0] ?? null;
    chargerMini(image ? cheminMini(image.chemin) : null);
  }

  function liberer() {
    if (miniUrl) URL.revokeObjectURL(miniUrl);
    miniUrl = null;
  }

  maj(todo);
  return { li, maj, liberer, id: todo.id, corps, vider() {} };
}
