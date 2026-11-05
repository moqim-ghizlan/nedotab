import { grouperAujourdhui } from "../../core/echeances.js";
import { el } from "../dom.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";
import { ouvrirEditeur } from "./fenetreTodo.js";
import { creerLigneTodo } from "./ligneTodo.js";
import { reconcilier } from "./listeCle.js";

/**
 * The "Aujourd'hui" view (V6.5): the todos still to do that are late, due today, tomorrow or
 * this week, from EVERY subject, in folding sections with a counter. Each line recalls its
 * subject in small. One listener, started by the panel when the tab is shown and stopped when it
 * is left (see donneesTodos.suivreAujourdhui). Up to 200 results; beyond, the message asks to
 * narrow down instead of loading more.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {import("../../core/store.js").Store} [d.store]
 */
export function creerVueAujourdhui({ donnees, store }) {
  const replies = new Set(); // ids of the folded sections
  const sections = new Map(); // id → { section, titre, liste, lignes }

  const vide = el("p", { class: "todos-vide", texte: "Rien d'urgent. Profitez-en.", hidden: true });
  const chargement = el("p", { class: "todos-vide", texte: "Chargement…", hidden: true });
  const trop = el("p", {
    class: "todos-message",
    texte: "Il y en a plus : terminez ou reportez quelques todos pour voir la suite.",
    hidden: true,
  });
  const erreur = el("p", { class: "todos-message todos-message--erreur", texte: "La vue est indisponible pour l'instant.", hidden: true });
  const racine = el("div", { class: "todos-vue todos-vue--aujourdhui" }, chargement, vide, erreur);
  racine.append(trop);

  const nomDuSujet = (t) => donnees.etat().sujets.find((s) => s.id === t.sujetId)?.nom ?? "";

  function ouvrir(id) {
    const t = donnees.trouver(id);
    if (t) ouvrirEditeur({ donnees, todoId: id, sujetId: t.sujetId, store });
  }

  function menu(id, bouton, evt) {
    const r = bouton?.getBoundingClientRect();
    ouvrirMenu({
      x: evt?.clientX ?? r.left,
      y: evt?.clientY ?? r.bottom + 4,
      libelle: "Actions du todo",
      retourFocus: bouton ?? undefined,
      entrees: [
        { libelle: "Ouvrir", onChoix: () => ouvrir(id) },
        "-",
        {
          libelle: "Supprimer",
          danger: true,
          onChoix: () => {
            const attente = donnees.supprimerTodo(id);
            toast("Todo supprimé", {
              action: { libelle: "Annuler", onClic: () => attente.annuler() },
              cle: "todos-suppression",
            });
          },
        },
      ],
    });
  }

  function creerSection(groupe) {
    const titre = el("button", {
      type: "button",
      class: "todos-faits-titre todos-groupe-titre",
      "aria-expanded": "true",
      onclick: () => {
        if (replies.has(groupe.id)) replies.delete(groupe.id);
        else replies.add(groupe.id);
        rendre();
      },
    });
    const liste = el("ul", { class: "todos-liste", "aria-label": groupe.libelle });
    const section = el("section", { class: `todos-groupe todos-groupe--${groupe.id}` }, titre, liste);
    return { section, titre, liste, lignes: new Map() };
  }

  const creer = (t) =>
    creerLigneTodo({
      todo: t,
      store,
      sujetDe: nomDuSujet,
      poignee: false,
      onCocher: (id) => donnees.cocher(id),
      onOuvrir: ouvrir,
      onMenu: menu,
    });

  function rendre() {
    const e = donnees.etat();
    const groupes = grouperAujourdhui(e.aujourdhui);
    const total = groupes.reduce((n, g) => n + g.todos.length, 0);
    for (const g of groupes) {
      let s = sections.get(g.id);
      if (!s) {
        s = creerSection(g);
        sections.set(g.id, s);
      }
      reconcilier(s.liste, s.lignes, g.todos, creer);
      const ferme = replies.has(g.id);
      s.titre.textContent = `${g.libelle} (${g.todos.length})`;
      s.titre.setAttribute("aria-expanded", String(!ferme));
      s.liste.hidden = ferme;
      s.section.hidden = g.todos.length === 0;
      if (s.section.parentElement !== racine) racine.insertBefore(s.section, trop);
    }
    const charge = e.aujourdhuiStatut === "chargement" && total === 0;
    chargement.hidden = !charge;
    erreur.hidden = e.aujourdhuiStatut !== "erreur";
    vide.hidden = charge || total > 0 || e.aujourdhuiStatut === "erreur";
    trop.hidden = !e.aujourdhuiPlein;
  }

  return { racine, rendre, titre: "Aujourd'hui", vider: () => donnees.viderCochages() };
}
