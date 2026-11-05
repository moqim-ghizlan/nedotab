import { creerDiffere } from "../../core/differe.js";
import { DESCRIPTION_MAX, TITRE_MAX, echeanceValide } from "../../core/todos.js";
import { ilYA } from "../../core/espacePartage.js";
import { rapatrierToasts, toast } from "../toast.js";
import { el } from "../dom.js";

let ouverte = null;

/** "à l'instant", "il y a 3 min", "hier", or "le 12 nov." for an older date. */
function quand(ms) {
  const relatif = ilYA(ms);
  return /^\d/.test(relatif) ? `le ${relatif}` : relatif;
}

/**
 * Edit window of a todo (V6.2): title, description (plain text for now), due date, "done" box,
 * delete. Typing is written 1.5 s after the last key, and at once when the window closes; only
 * the changed fields are sent. A snapshot never replaces a field that has the focus or that is
 * waiting to be sent.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {string} d.todoId
 * @param {HTMLElement} [d.retourFocus]
 */
export function ouvrirEditeur({ donnees, todoId, retourFocus }) {
  ouverte?.fermer();
  const depart = donnees.etat().todos.find((t) => t.id === todoId);
  if (!depart) return null;
  let en_attente = {}; // fields typed and not yet sent
  const differe = creerDiffere(() => envoyer());

  const titre = el("input", {
    type: "text",
    class: "todos-champ todo-editeur-titre",
    "aria-label": "Titre",
    placeholder: "Titre",
    maxlength: String(TITRE_MAX * 2),
  });
  const description = el("textarea", {
    class: "todos-champ todo-editeur-description",
    "aria-label": "Description",
    placeholder: "Description",
    rows: "6",
    maxlength: String(DESCRIPTION_MAX * 2),
  });
  const echeance = el("input", { type: "date", class: "todos-champ", "aria-label": "Échéance" });
  const fait = el("input", { type: "checkbox", id: `todo-fait-${todoId}` });
  const dates = el("p", { class: "todo-editeur-dates", "aria-live": "polite" });
  const message = el("p", { class: "todos-message todos-message--erreur", role: "alert", hidden: true });

  const dialogue = el(
    "dialog",
    { class: "dialogue todo-editeur", "aria-label": "Modifier le todo" },
    el(
      "div",
      { class: "formulaire" },
      titre,
      description,
      el(
        "div",
        { class: "todo-editeur-pied" },
        el("label", { class: "todo-editeur-label" }, "Échéance ", echeance),
        el("label", { class: "todo-editeur-label", for: fait.id }, fait, " Fait"),
      ),
      dates,
      message,
      el(
        "div",
        { class: "dialogue-actions" },
        el("button", {
          type: "button",
          class: "bouton bouton--danger",
          texte: "Supprimer",
          onclick: () => {
            const attente = donnees.supprimerTodo(todoId);
            toast("Todo supprimé", {
              action: { libelle: "Annuler", onClic: () => attente.annuler() },
              cle: "todos-suppression",
            });
            dialogue.close();
          },
        }),
        el("button", { type: "button", class: "bouton bouton--principal", texte: "Fermer", onclick: () => dialogue.close() }),
      ),
    ),
  );

  async function envoyer() {
    const champs = en_attente;
    en_attente = {};
    if (Object.keys(champs).length === 0) return;
    const r = await donnees.majTodo(todoId, champs);
    message.hidden = r.ok;
    if (!r.ok) message.textContent = r.erreur;
  }

  function planifier(cle, valeur) {
    en_attente = { ...en_attente, [cle]: valeur };
    differe.appeler(true);
  }

  titre.addEventListener("input", () => planifier("titre", titre.value.trim()));
  description.addEventListener("input", () => planifier("description", description.value));
  echeance.addEventListener("change", () => {
    const v = echeance.value || null;
    if (v !== null && !echeanceValide(v)) return;
    en_attente = { ...en_attente, echeance: v };
    differe.vider();
  });
  fait.addEventListener("change", () => donnees.cocher(todoId));

  function afficher() {
    const t = donnees.etat().todos.find((x) => x.id === todoId);
    if (!t) return dialogue.open && dialogue.close();
    const libre = (champ, cle) => document.activeElement !== champ && !(cle in en_attente);
    if (libre(titre, "titre")) titre.value = t.titre;
    if (libre(description, "description")) description.value = t.description;
    if (libre(echeance, "echeance")) echeance.value = t.echeance ?? "";
    fait.checked = !!t.fait;
    dates.textContent = `Créé ${quand(t.creeLe)} · Modifié ${quand(t.modifieLe)}`;
  }
  afficher();
  const desabonner = donnees.abonner(afficher);

  dialogue.addEventListener("close", () => {
    differe.vider();
    desabonner();
    rapatrierToasts();
    dialogue.remove();
    if (ouverte?.dialogue === dialogue) ouverte = null;
    retourFocus?.focus?.();
  });
  document.body.append(dialogue);
  dialogue.showModal();
  titre.focus();
  ouverte = { dialogue, fermer: () => dialogue.open && dialogue.close() };
  return ouverte;
}
