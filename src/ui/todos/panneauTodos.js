import { texteEnvoi } from "../../core/etatEnvoi.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { toast } from "../toast.js";
import { creerBandeauSujets } from "./bandeauSujets.js";
import { creerDonneesTodos } from "./donneesTodos.js";
import { creerLigneTodo } from "./ligneTodo.js";
import { reconcilier } from "./listeCle.js";
import { ouvrirModaleTodo } from "./modaleTodo.js";

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
  let faitsOuverts = false;
  const aFaire = new Map();
  const faits = new Map();

  // --- Elements ------------------------------------------------------------------------------------
  const bouton = el(
    "button",
    { type: "button", class: "todos-bouton", "aria-label": "Ouvrir les todos", title: "Todos", "aria-expanded": "false", onclick: () => (ouvert ? fermer() : ouvrir()) },
    icone("todos", { taille: 22 }),
  );
  const etatReseau = el("span", { class: "todos-etat", role: "status", "aria-live": "polite" });
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
  const vide = el("div", { class: "todos-vide", hidden: true }, el("strong", { texte: "Rien à faire ici" }), el("span", { texte: "Touchez « Nouveau todo » pour en ajouter un." }));
  const chargement = el("p", { class: "todos-attente", role: "status", texte: "Chargement…", hidden: true });
  const corps = el("div", { class: "todos-corps" }, vide, chargement, listeAFaire, boutonFaits, listeFaits);

  // Creating happens in a window (modaleTodo.js): the bar at the bottom is one button.
  const ajouter = el(
    "button",
    { type: "button", class: "todos-ajouter", "aria-haspopup": "dialog", "aria-label": "Nouveau todo", title: "Nouveau todo", onclick: () => ouvrirCreation(null, ajouter) },
    icone("ajouter", { taille: 20 }),
    el("span", { class: "todos-ajouter-texte", texte: "Nouveau todo" }),
  );
  const compositeur = el("div", { class: "todos-compositeur" }, ajouter);

  const imageDe = (liste) => [...(liste ?? [])].find((f) => f.type?.startsWith("image/"));

  function ouvrirCreation(fichier, origine) {
    if (donnees.etat().compteurs.nbTodos >= 500) return toast("500 todos maximum.", { type: "erreur" });
    ouvrirModaleTodo({ donnees, sujetId: donnees.etat().sujetId, preparer, appareils, retourFocus: origine ?? ajouter, fichier });
  }
  function ouvrirEdition(todo, origine) {
    ouvrirModaleTodo({ donnees, todo, preparer, appareils, retourFocus: origine, surSupprimer: supprimerTodo });
  }

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
  // A picture pasted or dropped on the panel starts a new todo with it.
  const surPaste = (e) => {
    if (e.defaultPrevented || document.querySelector("dialog[open]:modal")) return;
    const f = imageDe(e.clipboardData?.files);
    if (!f || compositeur.hidden) return;
    e.preventDefault();
    ouvrirCreation(f, ajouter);
  };
  principal.addEventListener("dragover", (e) => [...(e.dataTransfer?.types ?? [])].includes("Files") && e.preventDefault());
  principal.addEventListener("drop", (e) => {
    const f = imageDe(e.dataTransfer?.files);
    if (!f || compositeur.hidden) return;
    e.preventDefault();
    ouvrirCreation(f, ajouter);
  });
  const panneau = el(
    "aside",
    { class: "todos", role: "dialog", "aria-labelledby": "todos-titre", "aria-modal": "false", hidden: true },
    el("div", { class: "todos-poignee-feuille", "aria-hidden": "true" }),
    el("header", { class: "todos-entete" }, el("div", { class: "todos-entete-titre" }, el("h2", { id: "todos-titre", class: "todos-titre", texte: "Todos" }), etatReseau), fermerBouton),
    principal,
    nonConnecte,
    erreur,
  );

  panneau.addEventListener("paste", surPaste);

  // --- Lines -------------------------------------------------------------------------------------------------------
  function supprimerTodo(id) {
    const attente = donnees.supprimerTodo(id);
    toast("Todo supprimé", { action: { libelle: "Annuler", onClic: () => attente.annuler() }, cle: "todos-suppression" });
  }

  const creer = (t) => {
    return creerLigneTodo({ donnees, todo: t, surOuvrir: ouvrirEdition, store });
  };

  // --- Render ---------------------------------------------------------------------------------------------------------
  // The "not sent yet" note: Firestore marks every write as pending for a moment (the counters
  // move in the same batch as the todo, a snapshot comes back from the cache before the server's
  // answer). Told only when it lasts (5 s) or when the device is offline; the place is kept so
  // nothing jumps.
  let attenteDepuis = null;
  let minuteurEtat = null;
  function rendreEtat() {
    const e = donnees.etat();
    const horsLigne = typeof navigator !== "undefined" && navigator.onLine === false;
    const n = e.todos.filter((t) => t.enAttente).length + e.sujets.filter((s) => s.enAttente).length;
    if (n === 0) attenteDepuis = null;
    else attenteDepuis ??= Date.now();
    const { texte } = texteEnvoi({ enAttente: n, horsLigne, depuis: attenteDepuis, maintenant: Date.now() });
    etatReseau.textContent = texte;
    etatReseau.classList.toggle("todos-etat--visible", !!texte);
    clearTimeout(minuteurEtat);
    minuteurEtat = null;
    if (n > 0 && !horsLigne && !texte) minuteurEtat = setTimeout(rendreEtat, Math.max(100, 5000 - (Date.now() - attenteDepuis) + 50));
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
    ajouter.disabled = plein;
    ajouter.title = plein ? "500 todos maximum" : "Nouveau todo";
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
    if (grandEcran() && disponible() && e.sujets.length > 0) ajouter.focus();
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
    clearTimeout(minuteurEtat);
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
  };
}
