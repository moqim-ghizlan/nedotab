import Sortable from "sortablejs";
import { afficherTodos, creerIndexeur } from "../../core/rechercheTodos.js";
import { LIMITE_TODOS, TITRE_MAX } from "../../core/todos.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";
import { creerBarreFiltres } from "./barreFiltres.js";
import { ouvrirEditeur } from "./fenetreTodo.js";
import { creerLigneTodo } from "./ligneTodo.js";
import { reconcilier } from "./listeCle.js";

const REDUIT = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Todos of one subject (V6.2, search and filters V6.5): quick creation on one line, "À faire"
 * (manual order, drag or arrows on the grip) and "Faits (N)" folded under it, "Voir plus" past
 * 100. A bar offers search (accents and case ignored, on the todos already loaded), a filter, a
 * sort and the explicit button "Tous les sujets" (100 more todos each time it is asked, so the
 * cost is visible). Writes go through `donnees`; the lists are updated in place by stable keys.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {string} d.sujetId
 * @param {import("../../core/store.js").Store} [d.store]
 */
export function creerListeTodos({ donnees, sujetId, store }) {
  const aFaire = new Map();
  const faits = new Map();
  const partout = new Map();
  const indexer = creerIndexeur();
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
  const nouveau = el(
    "button",
    {
      type: "button",
      class: "todos-bouton-ajout todos-bouton-ajout--editeur",
      "aria-label": "Nouveau todo détaillé",
      title: "Nouveau todo détaillé (titre, description, échéance)",
      onclick: () => ouvrirEditeur({ donnees, todoId: null, sujetId, store, retourFocus: nouveau }),
    },
    icone("crayon", { taille: 18 }),
  );
  const formulaire = el("form", { class: "todos-ajout", novalidate: true }, champ, ajouter, nouveau);
  const barre = creerBarreFiltres({
    onChange: (fo) => {
      if (fo.portee === "tous" && donnees.etat().tousStatut === "vide") donnees.chargerTous();
      if (fo.portee === "sujet") donnees.viderTous();
      rendre();
    },
  });
  const listeAFaire = el("ul", { class: "todos-liste", "aria-label": "À faire" });
  const listeFaits = el("ul", { class: "todos-liste todos-liste--faits", "aria-label": "Faits", hidden: true });
  const listeTous = el("ul", { class: "todos-liste todos-liste--tous", "aria-label": "Résultats dans tous les sujets", hidden: true });
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
  const aucun = el("p", { class: "todos-vide", texte: "Aucun todo ne correspond.", hidden: true });
  const chargement = el("p", { class: "todos-vide", texte: "Chargement…", hidden: true });
  const plus = el("button", {
    type: "button",
    class: "bouton todos-voir-plus",
    texte: "Voir plus",
    hidden: true,
    onclick: () => donnees.voirPlus(),
  });
  const chargerPlus = el("button", {
    type: "button",
    class: "bouton todos-voir-plus",
    texte: "Charger 100 todos de plus",
    hidden: true,
    onclick: () => donnees.chargerTous(),
  });
  const portee = el("p", { class: "todos-message", hidden: true });
  const racine = el(
    "div",
    { class: "todos-vue todos-vue--sujet" },
    formulaire,
    barre.racine,
    message,
    chargement,
    vide,
    aucun,
    listeAFaire,
    boutonFaits,
    listeFaits,
    portee,
    listeTous,
    plus,
    chargerPlus,
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
  const trouver = (id) => donnees.trouver(id);
  const nomDuSujet = (t) => donnees.etat().sujets.find((s) => s.id === t.sujetId)?.nom ?? "";

  function ouvrir(id) {
    const t = trouver(id);
    if (!t) return;
    const ligne = aFaire.get(id) ?? faits.get(id) ?? partout.get(id);
    ouvrirEditeur({ donnees, todoId: id, sujetId: t.sujetId, store, retourFocus: ligne?.corps });
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
    const t = trouver(id);
    const autres = donnees.etat().sujets.filter((s) => s.id !== t?.sujetId);
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

  // "/" puts the focus in the search (not while typing somewhere else).
  racine.addEventListener("keydown", (e) => {
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
      e.preventDefault();
      barre.focus();
    }
  });

  // --- Render ----------------------------------------------------------------------------------------
  const options = () => ({ store, requete: () => barre.etat().requete });
  const creer = (t) =>
    creerLigneTodo({
      todo: t,
      store,
      requete: options().requete,
      onCocher: (id) => donnees.cocher(id),
      onOuvrir: ouvrir,
      onMenu: menu,
    });
  const creerPartout = (t) =>
    creerLigneTodo({
      todo: t,
      store,
      requete: options().requete,
      sujetDe: nomDuSujet,
      poignee: false,
      onCocher: (id) => donnees.cocher(id),
      onOuvrir: ouvrir,
      onMenu: menu,
    });

  function rendre() {
    if (glisse) {
      renduEnAttente = true;
      return;
    }
    renduEnAttente = false;
    const e = donnees.etat();
    const fo = barre.etat();
    const mondial = fo.portee === "tous";
    const source = mondial ? e.tous : e.todos;
    const visibles = afficherTodos(source, { ...fo, index: indexer(source) });
    // The manual order can only be changed when nothing narrows or reorders the list.
    const libre = fo.tri !== "manuel" || barre.actif();
    tri.option("disabled", libre || mondial);
    racine.classList.toggle("todos-vue--libre", libre || mondial);

    // One list per place: the subject (to do / done) or the results from every subject.
    const aF = mondial ? [] : visibles.filter((t) => !t.fait);
    const fa = mondial ? [] : visibles.filter((t) => t.fait);
    reconcilier(listeAFaire, aFaire, aF, creer);
    reconcilier(listeFaits, faits, fa, creer);
    reconcilier(listeTous, partout, mondial ? visibles : [], creerPartout);
    listeAFaire.hidden = mondial;
    listeTous.hidden = !mondial;
    boutonFaits.hidden = mondial || fa.length === 0;
    boutonFaits.textContent = `Faits (${fa.length})`;
    boutonFaits.setAttribute("aria-expanded", String(faitsOuverts));
    listeFaits.hidden = mondial || fa.length === 0 || !faitsOuverts;

    const plein = e.compteurs.nbTodos >= LIMITE_TODOS;
    champ.disabled = plein;
    ajouter.disabled = plein;
    nouveau.disabled = plein;
    champ.placeholder = plein ? `${LIMITE_TODOS} todos maximum` : "Ajouter un todo";

    const statut = mondial ? e.tousStatut : e.todosStatut;
    const charge = statut === "chargement" && source.length === 0;
    chargement.hidden = !charge;
    vide.hidden = mondial || charge || e.todos.length > 0 || e.todosStatut === "erreur";
    aucun.hidden = charge || visibles.length > 0 || source.length === 0 || !barre.actif();
    if (statut === "erreur") dire("Les todos sont indisponibles pour l'instant.");
    plus.hidden = mondial || !e.todosPlein;
    chargerPlus.hidden = !mondial || !e.tousPlein || e.tousStatut === "chargement";
    portee.hidden = !mondial;
    portee.textContent = mondial
      ? `${e.tous.length} todos chargés, tous sujets confondus${e.tousPlein ? " : seuls ceux-là sont recherchés" : ""}.`
      : "";
  }

  return {
    racine,
    rendre,
    titre: "Sujet",
    /** Writes what is waiting (closing the panel). */
    vider: () => donnees.viderCochages(),
    /** The shortcut "/" of the panel. */
    focusRecherche: () => barre.focus(),
    liberer() {
      tri.destroy();
      barre.liberer();
      donnees.viderCochages();
      donnees.viderTous();
      donnees.suivreSujet(null);
    },
  };
}
