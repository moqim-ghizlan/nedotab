import Sortable from "sortablejs";
import { LIMITE_TODOS, TITRE_MAX } from "../../core/todos.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";
import { ouvrirEditeur } from "./fenetreTodo.js";
import { creerLigneTodo } from "./ligneTodo.js";
import { reconcilier } from "./listeCle.js";

const REDUIT = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Todos of one subject (V6.2): quick creation on one line, "À faire" (manual order, drag or
 * arrows on the grip) and "Faits (N)" folded under it, "Voir plus" past 100. Writes go through
 * `donnees`; the list is updated in place by stable keys (the id of the todo).
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {string} d.sujetId
 * @param {import("../../core/store.js").Store} [d.store]
 */
export function creerListeTodos({ donnees, sujetId, store }) {
  const aFaire = new Map();
  const faits = new Map();
  let glisse = false;
  let renduEnAttente = false;
  let faitsOuverts = false;

  donnees.suivreSujet(sujetId);

  const message = el("p", { class: "todos-message", role: "status", "aria-live": "polite", hidden: true });
  const champ = el("input", {
    type: "text",
    class: "todos-champ",
    placeholder: "Ajouter un todo",
    "aria-label": "Titre du nouveau todo",
    maxlength: String(TITRE_MAX * 2),
    autocomplete: "off",
    enterkeyhint: "done",
  });
  const ajouter = el(
    "button",
    { type: "submit", class: "todos-bouton-ajout", "aria-label": "Ajouter le todo", title: "Ajouter le todo" },
    icone("ajouter", { taille: 20 }),
  );
  const formulaire = el("form", { class: "todos-ajout", novalidate: true }, champ, ajouter);
  const listeAFaire = el("ul", { class: "todos-liste", "aria-label": "À faire" });
  const listeFaits = el("ul", { class: "todos-liste todos-liste--faits", "aria-label": "Faits", hidden: true });
  const boutonFaits = el("button", {
    type: "button",
    class: "todos-faits-titre",
    "aria-expanded": "false",
    hidden: true,
    onclick: () => {
      faitsOuverts = !faitsOuverts;
      rendre();
    },
  });
  const vide = el("p", { class: "todos-vide", texte: "Rien à faire ici. Ajoutez un todo ci-dessus.", hidden: true });
  const chargement = el("p", { class: "todos-vide", texte: "Chargement…", hidden: true });
  const plus = el("button", {
    type: "button",
    class: "bouton todos-voir-plus",
    texte: "Voir plus",
    hidden: true,
    onclick: () => donnees.voirPlus(),
  });
  const racine = el(
    "div",
    { class: "todos-vue todos-vue--sujet" },
    formulaire,
    message,
    chargement,
    vide,
    listeAFaire,
    boutonFaits,
    listeFaits,
    plus,
  );

  function dire(texte, erreur = true) {
    message.textContent = texte ?? "";
    message.hidden = !texte;
    message.classList.toggle("todos-message--erreur", !!texte && erreur);
  }

  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!champ.value.trim()) return dire("Écrivez un titre pour ajouter un todo.");
    const titre = champ.value;
    champ.value = "";
    const r = await donnees.ajouterTodo(sujetId, titre);
    if (!r.ok) {
      champ.value = titre;
      return dire(r.erreur);
    }
    dire(null);
    champ.focus();
  });
  champ.addEventListener("input", () => !message.hidden && dire(null));

  // --- Actions of a line ------------------------------------------------------------------------
  const trouver = (id) => donnees.etat().todos.find((t) => t.id === id);

  function ouvrir(id) {
    const t = trouver(id);
    if (t) ouvrirEditeur({ donnees, todoId: id, sujetId, store, retourFocus: (aFaire.get(id) ?? faits.get(id))?.corps });
  }

  function menu(id, bouton, evt) {
    const t = trouver(id);
    if (!t) return;
    const r = bouton?.getBoundingClientRect();
    ouvrirMenu({
      x: evt?.clientX ?? r.left,
      y: evt?.clientY ?? r.bottom + 4,
      libelle: "Actions du todo",
      retourFocus: bouton ?? undefined,
      entrees: [
        { libelle: "Ouvrir", onChoix: () => ouvrir(id) },
        { libelle: "Déplacer vers…", onChoix: () => deplacerVers(id) },
        "-",
        { libelle: "Supprimer", danger: true, onChoix: () => supprimer(id) },
      ],
    });
  }

  function supprimer(id) {
    const attente = donnees.supprimerTodo(id);
    toast("Todo supprimé", {
      action: { libelle: "Annuler", onClic: () => attente.annuler() },
      cle: "todos-suppression",
    });
  }

  async function deplacerVers(id) {
    const autres = donnees.etat().sujets.filter((s) => s.id !== sujetId);
    if (autres.length === 0) return toast("Créez d'abord un autre sujet.", { type: "info" });
    let choix = null;
    const boutons = autres.map((s) =>
      el("button", {
        type: "button",
        class: "todos-choix-sujet",
        dataset: { couleur: s.couleur ?? "" },
        texte: s.nom,
        onclick: (e) => {
          choix = s.id;
          e.currentTarget.closest("dialog").close();
        },
      }),
    );
    await demander({
      titre: "Déplacer vers…",
      contenu: [el("div", { class: "todos-choix-liste" }, boutons)],
      boutons: [{ libelle: "Annuler", valeur: null }],
    });
    if (!choix) return;
    const r = await donnees.deplacerVersSujet(id, choix);
    if (!r.ok) dire(r.erreur);
    else toast("Todo déplacé");
  }

  // --- Reordering ----------------------------------------------------------------------------------
  async function envoyerOrdre(id) {
    const avant = aFaire.get(id)?.li.previousElementSibling?.dataset.id ?? null;
    const r = await donnees.reordonnerTodo(id, avant);
    if (!r.ok) dire(r.erreur);
  }

  const tri = Sortable.create(listeAFaire, {
    handle: ".todo-poignee",
    animation: REDUIT() ? 0 : 150,
    delay: 300,
    delayOnTouchOnly: true,
    scroll: true,
    onStart: () => {
      glisse = true;
    },
    onEnd: (evt) => {
      glisse = false;
      envoyerOrdre(evt.item.dataset.id).finally(() => renduEnAttente && rendre());
    },
  });

  // Keyboard: ↑ ↓ move the focus between lines; on the grip they move the todo itself.
  racine.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const li = e.target.closest?.(".todo-ligne");
    if (!li) return;
    e.preventDefault();
    const haut = e.key === "ArrowUp";
    if (e.target.classList.contains("todo-poignee") && li.parentElement === listeAFaire) {
      const cible = haut ? li.previousElementSibling : li.nextElementSibling;
      if (!cible) return;
      listeAFaire.insertBefore(li, haut ? cible : cible.nextElementSibling);
      e.target.focus();
      envoyerOrdre(li.dataset.id);
      return;
    }
    const classe = [...e.target.classList].find((c) => ["todo-corps", "todo-case", "todos-plus"].includes(c));
    const voisin = haut ? li.previousElementSibling : li.nextElementSibling;
    voisin?.querySelector(`.${classe ?? "todo-corps"}`)?.focus();
  });

  // --- Render ----------------------------------------------------------------------------------------
  const creer = (t) =>
    creerLigneTodo({ todo: t, store, onCocher: (id) => donnees.cocher(id), onOuvrir: ouvrir, onMenu: menu });

  function rendre() {
    if (glisse) {
      renduEnAttente = true;
      return;
    }
    renduEnAttente = false;
    const e = donnees.etat();
    const aF = e.todos.filter((t) => !t.fait);
    const fa = e.todos.filter((t) => t.fait);
    reconcilier(listeAFaire, aFaire, aF, creer);
    reconcilier(listeFaits, faits, fa, creer);
    boutonFaits.hidden = fa.length === 0;
    boutonFaits.textContent = `Faits (${fa.length})`;
    boutonFaits.setAttribute("aria-expanded", String(faitsOuverts));
    listeFaits.hidden = fa.length === 0 || !faitsOuverts;
    const plein = e.compteurs.nbTodos >= LIMITE_TODOS;
    champ.disabled = plein;
    ajouter.disabled = plein;
    champ.placeholder = plein ? `${LIMITE_TODOS} todos maximum` : "Ajouter un todo";
    const charge = e.todosStatut === "chargement" && e.todos.length === 0;
    chargement.hidden = !charge;
    vide.hidden = charge || e.todos.length > 0 || e.todosStatut === "erreur";
    if (e.todosStatut === "erreur") dire("Les todos sont indisponibles pour l'instant.");
    plus.hidden = !e.todosPlein;
  }

  return {
    racine,
    rendre,
    titre: "Sujet",
    /** Writes what is waiting (closing the panel). */
    vider: () => donnees.viderCochages(),
    liberer() {
      tri.destroy();
      donnees.viderCochages();
      donnees.suivreSujet(null);
    },
  };
}
