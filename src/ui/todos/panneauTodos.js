import { TITRE_MAX } from "../../core/todos.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { toast } from "../toast.js";
import { creerBandeauSujets } from "./bandeauSujets.js";
import { creerDonneesTodos } from "./donneesTodos.js";
import { creerLigneTodo } from "./ligneTodo.js";
import { reconcilier } from "./listeCle.js";

const grandEcran = () => globalThis.matchMedia?.("(min-width: 900px)").matches;

/**
 * The todo panel: a round button at the bottom left and a panel on the left (a full-screen sheet
 * on a phone). ONE screen: the subjects as tabs on top, the todos of the chosen subject under
 * them, a field to add a todo at the bottom. A todo opens in place (title, description, one
 * picture). Not signed in: the button stays, the panel offers the sign-in. The listeners run only
 * while the panel is open or the tab is visible with the button shown.
 *
 * @param {object} d
 * @param {() => boolean} d.disponible signed in and synchronised (account mode)
 * @param {() => boolean} [d.actif] the setting "Activer les todos": off, nothing is shown or read
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 * @param {() => Promise<unknown>} [d.connecter] opens the sign-in (the existing flow)
 * @param {() => void} [d.fermerAutres] closes the other panels (sharing space) when this one opens
 */
export function creerPanneauTodos({
  disponible,
  actif = () => true,
  charger,
  uid,
  connecter = async () => {},
  fermerAutres = () => {},
  store,
  preparer,
  appareils = null,
  donnees = creerDonneesTodos({ charger, uid }),
}) {
  let ouvert = false;
  let retourFocus = null;
  let ouvertId = null; // the todo open in place (one at a time)
  let faitsOuverts = false;
  const aFaire = new Map();
  const faits = new Map();

  // --- Elements ------------------------------------------------------------------------------------
  const bouton = el(
    "button",
    { type: "button", class: "todos-bouton", "aria-label": "Ouvrir les todos", title: "Todos", "aria-expanded": "false", onclick: () => (ouvert ? fermer() : ouvrir()) },
    icone("todos", { taille: 22 }),
  );
  const etatReseau = el("span", { class: "todos-etat", role: "status", "aria-live": "polite", hidden: true });
  const fermerBouton = el("button", { type: "button", class: "todos-fermer", "aria-label": "Fermer", title: "Fermer (Échap)", onclick: () => fermer() }, icone("fermer", { taille: 18 }));
  const bandeau = creerBandeauSujets({ donnees });

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
  const vide = el("div", { class: "todos-vide", hidden: true }, el("strong", { texte: "Rien à faire ici" }), el("span", { texte: "Écrivez un todo dans le champ en bas." }));
  const chargement = el("p", { class: "todos-attente", role: "status", texte: "Chargement…", hidden: true });
  const corps = el("div", { class: "todos-corps" }, vide, chargement, listeAFaire, boutonFaits, listeFaits);

  const champ = el("input", { type: "text", class: "todos-champ", placeholder: "Nouveau todo", "aria-label": "Titre du nouveau todo", maxlength: String(TITRE_MAX * 2), autocomplete: "off", enterkeyhint: "done" });
  const ajouter = el("button", { type: "submit", class: "todos-ajouter", "aria-label": "Ajouter le todo", title: "Ajouter le todo" }, icone("ajouter", { taille: 20 }));
  const message = el("p", { class: "todos-message", role: "status", "aria-live": "polite", hidden: true });
  const compositeur = el("form", { class: "todos-compositeur", novalidate: true }, el("div", { class: "todos-compositeur-ligne" }, champ, ajouter), message);

  const nonConnecte = el(
    "div",
    { class: "todos-etat-plein" },
    el("p", { texte: "Connectez-vous pour utiliser vos todos." }),
    el("button", { type: "button", class: "bouton bouton--principal", texte: "Se connecter", onclick: () => connecter() }),
  );
  const erreur = el(
    "div",
    { class: "todos-etat-plein" },
    el("p", { texte: "Les todos sont indisponibles pour l'instant." }),
    el("button", { type: "button", class: "bouton", texte: "Réessayer", onclick: () => { donnees.arreter(); donnees.demarrer(); } }),
  );
  const principal = el("div", { class: "todos-principal" }, bandeau.racine, corps, compositeur);
  const panneau = el(
    "aside",
    { class: "todos", role: "dialog", "aria-labelledby": "todos-titre", "aria-modal": "false", hidden: true },
    el("div", { class: "todos-poignee-feuille", "aria-hidden": "true" }),
    el("header", { class: "todos-entete" }, el("div", { class: "todos-entete-titre" }, el("h2", { id: "todos-titre", class: "todos-titre", texte: "Todos" }), etatReseau), fermerBouton),
    principal,
    nonConnecte,
    erreur,
  );

  // --- Adding a todo --------------------------------------------------------------------------------------
  function dire(texte) {
    message.textContent = texte ?? "";
    message.hidden = !texte;
  }
  compositeur.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titre = champ.value;
    if (!titre.trim()) return dire("Écrivez un titre pour ajouter un todo.");
    champ.value = "";
    const r = await donnees.ajouterTodo(titre);
    if (!r.ok) {
      champ.value = titre;
      return dire(r.erreur);
    }
    dire(null);
    champ.focus();
  });
  champ.addEventListener("input", () => !message.hidden && dire(null));

  // --- Lines -------------------------------------------------------------------------------------------------------
  function bascule(id, oui) {
    if (ouvertId && ouvertId !== id) (aFaire.get(ouvertId) ?? faits.get(ouvertId))?.basculer(false);
    ouvertId = oui ? id : null;
    const ligne = aFaire.get(id) ?? faits.get(id);
    ligne?.basculer(oui);
    if (oui) ligne?.li.scrollIntoView?.({ block: "nearest", behavior: matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function supprimerTodo(id) {
    const attente = donnees.supprimerTodo(id);
    if (ouvertId === id) ouvertId = null;
    toast("Todo supprimé", { action: { libelle: "Annuler", onClic: () => attente.annuler() }, cle: "todos-suppression" });
  }

  const creer = (t) => {
    const ligne = creerLigneTodo({ donnees, todo: t, surBascule: bascule, store, preparer, appareils });
    ligne.surSuppression(supprimerTodo);
    return ligne;
  };

  // --- Render ---------------------------------------------------------------------------------------------------------
  function rendreEtat() {
    const e = donnees.etat();
    const horsLigne = typeof navigator !== "undefined" && navigator.onLine === false;
    const n = e.todos.filter((t) => t.enAttente).length + e.sujets.filter((s) => s.enAttente).length;
    const texte = horsLigne ? (n > 0 ? `Hors ligne · ${n} en attente d'envoi` : "Hors ligne") : n > 0 ? `En attente d'envoi (${n})` : "";
    etatReseau.textContent = texte;
    etatReseau.hidden = !texte;
  }

  function rendre() {
    if (!ouvert) return;
    rendreEtat();
    const dispo = disponible();
    const e = donnees.etat();
    principal.hidden = !dispo || e.statut === "erreur";
    nonConnecte.hidden = dispo;
    erreur.hidden = !dispo || e.statut !== "erreur";
    if (principal.hidden) return;
    bandeau.rendre();
    const aucunSujet = e.sujets.length === 0;
    corps.hidden = aucunSujet;
    compositeur.hidden = aucunSujet;
    if (aucunSujet) return;
    const a = e.todos.filter((t) => !t.fait);
    const f = e.todos.filter((t) => t.fait);
    // The line open in place must still exist (removed here or elsewhere).
    if (ouvertId && !e.todos.some((t) => t.id === ouvertId)) ouvertId = null;
    reconcilier(listeAFaire, aFaire, a, creer);
    reconcilier(listeFaits, faits, f, creer);
    boutonFaits.hidden = f.length === 0;
    boutonFaits.textContent = `Faits (${f.length})`;
    boutonFaits.setAttribute("aria-expanded", String(faitsOuverts));
    listeFaits.hidden = f.length === 0 || !faitsOuverts;
    const charge = e.todosStatut === "chargement" && e.todos.length === 0;
    chargement.hidden = !charge;
    vide.hidden = charge || e.todos.length > 0 || e.todosStatut === "erreur";
    const plein = e.compteurs.nbTodos >= 500;
    champ.disabled = plein;
    ajouter.disabled = plein;
    champ.placeholder = plein ? "500 todos maximum" : "Nouveau todo";
  }
  donnees.abonner(rendre);

  // --- Open / close ------------------------------------------------------------------------------------------------------
  function ouvrir() {
    if (ouvert || !actif()) return;
    fermerAutres();
    ouvert = true;
    retourFocus = document.activeElement;
    panneau.hidden = false;
    bouton.setAttribute("aria-expanded", "true");
    if (disponible()) donnees.demarrer();
    rendre();
    // No automatic focus on a phone: the keyboard would pop up on its own.
    const e = donnees.etat();
    if (grandEcran() && disponible() && e.sujets.length > 0) champ.focus();
    else if (grandEcran() && disponible() && e.statut === "ok") bandeau.focusAjout();
    else if (!grandEcran() || !disponible()) fermerBouton.focus();
    document.addEventListener("keydown", surTouche);
    setTimeout(() => ouvert && document.addEventListener("pointerdown", surExterieur), 0);
  }

  function fermer() {
    if (!ouvert) return;
    ouvert = false;
    for (const l of [...aFaire.values(), ...faits.values()]) l.vider();
    donnees.viderCochages();
    panneau.hidden = true;
    bouton.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", surTouche);
    document.removeEventListener("pointerdown", surExterieur);
    if (document.hidden) donnees.arreter();
    (retourFocus?.isConnected ? retourFocus : bouton).focus?.();
  }

  const surTouche = (e) => {
    if (e.key === "Escape") {
      // A dialog, a menu or the picture viewer above the panel takes the key first.
      if (document.querySelector("dialog[open]:modal, .menu")) return;
      e.preventDefault();
      fermer();
    } else if (e.key === "Tab") {
      const cibles = [...panneau.querySelectorAll("button, a[href], textarea, input:not([type=file]), select")].filter((n) => !n.disabled && !n.closest("[hidden], [inert]") && n.tabIndex >= 0);
      if (cibles.length === 0) return;
      const premier = cibles[0];
      const dernier = cibles.at(-1);
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }
  };
  const surExterieur = (e) => {
    if (!panneau.contains(e.target) && !bouton.contains(e.target) && !e.target.closest?.(".toast, .menu, dialog")) fermer();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!ouvert) donnees.arreter();
    } else if (ouvert && disponible()) donnees.demarrer();
  });
  addEventListener("online", rendre);
  addEventListener("offline", rendre);

  /** Account or setting changed: the button follows the setting, the data follow the sign-in. */
  function actualiser() {
    bouton.hidden = !actif();
    if (!actif()) {
      if (ouvert) fermer();
      donnees.reinitialiser();
      return;
    }
    if (!disponible()) {
      donnees.reinitialiser();
      ouvertId = null;
    } else if (ouvert) donnees.demarrer();
    rendre();
  }

  return {
    bouton,
    panneau,
    ouvrir,
    fermer,
    actualiser,
    donnees,
    estOuvert: () => ouvert,
    /** Tests: the todo open in place, or null. */
    ouvertId: () => ouvertId,
  };
}
