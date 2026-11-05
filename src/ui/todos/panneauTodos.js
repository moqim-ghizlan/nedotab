import { el } from "../dom.js";
import { icone } from "../icones.js";
import { creerDonneesTodos } from "./donneesTodos.js";
import { creerListeSujets } from "./listeSujets.js";
import { creerListeTodos } from "./listeTodos.js";

const grandEcran = () => globalThis.matchMedia?.("(min-width: 900px)").matches;
const ID_TITRE = "todos-titre";

/**
 * Todo panel (V6.1): a round button at the bottom left (next to the sharing button) and a panel
 * on the left (360 px on a wide screen, a full-screen sheet on a small one). It lists the
 * subjects; a click opens the todos of one subject (V6.2).
 *
 * The listeners of Firestore run only while the panel is open or the tab is visible with the
 * button shown, and are stopped otherwise. Not signed in: the button stays, the panel offers the
 * sign-in.
 *
 * @param {object} d
 * @param {() => boolean} d.disponible signed in and synchronised (account mode)
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 * @param {() => Promise<unknown>} [d.connecter] opens the sign-in (the existing flow)
 * @param {() => void} [d.fermerAutres] closes the other panels (sharing space) when this one opens
 * @param {(ctx: object) => { racine: HTMLElement, rendre: () => void, titre: string, liberer?: () => void }} [d.creerVueSujet]
 *   view of the todos of one subject (V6.2); an empty message without it
 */
export function creerPanneauTodos({
  disponible,
  charger,
  uid,
  connecter = async () => {},
  fermerAutres = () => {},
  store,
  creerVueSujet = (ctx) => creerListeTodos({ ...ctx, store }),
  donnees = creerDonneesTodos({ charger, uid }),
}) {
  let ouvert = false;
  let retourFocus = null;
  let sujetId = null; // null: list of the subjects
  let vueSujet = null;

  const pastille = el("span", { class: "todos-pastille", hidden: true, "aria-hidden": "true" });
  const bouton = el(
    "button",
    {
      type: "button",
      class: "todos-bouton",
      "aria-label": "Ouvrir les todos",
      title: "Todos",
      "aria-expanded": "false",
      onclick: () => (ouvert ? fermer() : ouvrir()),
    },
    icone("todos", { taille: 22 }),
    pastille,
  );

  const titre = el("h2", { id: ID_TITRE, class: "todos-titre", texte: "Todos" });
  const retour = el(
    "button",
    {
      type: "button",
      class: "todos-retour",
      hidden: true,
      "aria-label": "Retour aux sujets",
      title: "Retour aux sujets",
      onclick: () => ouvrirListe(),
    },
    icone("retour", { taille: 18 }),
    el("span", { texte: "Sujets" }),
  );
  const etatReseau = el("span", { class: "todos-etat", role: "status", "aria-live": "polite", hidden: true });
  const fermerBouton = el(
    "button",
    {
      type: "button",
      class: "todos-fermer",
      "aria-label": "Fermer",
      title: "Fermer (Échap)",
      onclick: () => fermer(),
    },
    icone("fermer", { taille: 18 }),
  );
  const corps = el("div", { class: "todos-corps" });
  const panneau = el(
    "aside",
    {
      class: "todos",
      role: "dialog",
      "aria-labelledby": ID_TITRE,
      "aria-modal": "false",
      hidden: true,
    },
    el("div", { class: "todos-poignee-feuille", "aria-hidden": "true" }),
    el(
      "header",
      { class: "todos-entete" },
      retour,
      el("div", { class: "todos-entete-titre" }, titre, etatReseau),
      fermerBouton,
    ),
    corps,
  );

  const sujets = creerListeSujets({ donnees, onOuvrir: (id) => ouvrirSujet(id) });

  // --- Not signed in ---------------------------------------------------------------------------
  const nonConnecte = el(
    "div",
    { class: "todos-vue todos-vue--centre" },
    el("p", { class: "todos-vide", texte: "Connectez-vous pour utiliser vos todos" }),
    el("button", {
      type: "button",
      class: "bouton bouton--principal",
      texte: "Se connecter",
      onclick: () => connecter(),
    }),
  );
  const chargement = el("p", { class: "todos-vide", texte: "Chargement…", role: "status" });
  const erreur = el(
    "div",
    { class: "todos-vue todos-vue--centre" },
    el("p", { class: "todos-vide", texte: "Les todos sont indisponibles pour l'instant." }),
    el("button", {
      type: "button",
      class: "bouton",
      texte: "Réessayer",
      onclick: () => {
        donnees.arreter();
        donnees.demarrer();
      },
    }),
  );

  // --- Views -------------------------------------------------------------------------------------
  function afficher(noeud) {
    if (corps.firstElementChild !== noeud || corps.childElementCount !== 1) corps.replaceChildren(noeud);
  }

  function ouvrirListe() {
    vueSujet?.liberer?.();
    vueSujet = null;
    sujetId = null;
    titre.textContent = "Todos";
    retour.hidden = true;
    rendre();
    sujets.racine.querySelector(".todos-sujet-corps")?.focus();
  }

  function ouvrirSujet(id) {
    const sujet = donnees.etat().sujets.find((s) => s.id === id);
    if (!sujet) return;
    sujetId = id;
    vueSujet?.liberer?.();
    vueSujet = creerVueSujet({ donnees, sujetId: id, retour: () => ouvrirListe() });
    retour.hidden = false;
    rendre();
    vueSujet.racine.querySelector("input, textarea, button")?.focus?.();
  }

  function rendreEtat() {
    const e = donnees.etat();
    const horsLigne = typeof navigator !== "undefined" && navigator.onLine === false;
    const texte = horsLigne
      ? "Hors ligne"
      : e.enAttente
        ? "En attente d'envoi"
        : null;
    etatReseau.textContent = texte ?? "";
    etatReseau.hidden = !texte;
    etatReseau.dataset.etat = horsLigne ? "hors-ligne" : "attente";
  }

  function rendre() {
    if (!ouvert) return;
    rendreEtat();
    if (!disponible()) return afficher(nonConnecte);
    const e = donnees.etat();
    if (e.statut === "erreur") return afficher(erreur);
    if (sujetId) {
      const sujet = e.sujets.find((s) => s.id === sujetId);
      if (!sujet && e.statut === "ok") {
        // The subject was removed (here or on another device): back to the list.
        return ouvrirListe();
      }
      if (vueSujet) {
        titre.textContent = sujet?.nom ?? vueSujet.titre ?? "Sujet";
        afficher(vueSujet.racine);
        vueSujet.rendre();
        return;
      }
    }
    if (e.statut === "chargement" && e.sujets.length === 0) return afficher(chargement);
    afficher(sujets.racine);
    sujets.rendre();
  }

  donnees.abonner(() => {
    rendre();
    majPastille();
  });

  /** The dot of the button is the number of late todos (V6.5); here, room for it only. */
  function majPastille() {
    pastille.hidden = !(donnees.enRetard?.() > 0);
    if (!pastille.hidden) pastille.textContent = "";
  }

  // --- Open / close ----------------------------------------------------------------------------------
  function ouvrir() {
    if (ouvert) return;
    fermerAutres();
    ouvert = true;
    retourFocus = document.activeElement;
    panneau.hidden = false;
    bouton.setAttribute("aria-expanded", "true");
    bouton.setAttribute("aria-label", "Fermer les todos");
    if (disponible()) donnees.demarrer();
    rendre();
    // No automatic focus on a phone: the keyboard would pop up on its own.
    if (grandEcran() && disponible() && !sujetId) sujets.focusAjout();
    else fermerBouton.focus();
    document.addEventListener("keydown", surTouche);
    setTimeout(() => ouvert && document.addEventListener("pointerdown", surExterieur), 0);
  }

  function fermer() {
    if (!ouvert) return;
    ouvert = false;
    vueSujet?.vider?.();
    panneau.hidden = true;
    bouton.setAttribute("aria-expanded", "false");
    bouton.setAttribute("aria-label", "Ouvrir les todos");
    document.removeEventListener("keydown", surTouche);
    document.removeEventListener("pointerdown", surExterieur);
    if (document.hidden) donnees.arreter();
    (retourFocus?.isConnected ? retourFocus : bouton).focus?.();
  }

  const surTouche = (e) => {
    if (e.key === "Escape") {
      // A dialog, a menu or the editor above the panel takes the key first.
      if (document.querySelector("dialog[open]:modal, .menu, .todo-editeur")) return;
      e.preventDefault();
      fermer();
    } else if (e.key === "Tab") {
      const cibles = [
        ...panneau.querySelectorAll("button, a[href], textarea, input:not([type=file]), select"),
      ].filter((n) => !n.disabled && !n.closest("[hidden]") && n.tabIndex >= 0);
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
    if (
      !panneau.contains(e.target) &&
      !bouton.contains(e.target) &&
      !e.target.closest?.(".toast, .menu, dialog, .todo-editeur, .visionneuse")
    )
      fermer();
  };

  // The listeners follow the visibility of the tab (Safari suspends them in the background).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!ouvert) donnees.arreter();
    } else if (ouvert && disponible()) {
      donnees.demarrer();
    }
  });
  addEventListener("online", rendre);
  addEventListener("offline", rendre);

  /** Called when the account changes: the button is always there, the data follow the sign-in. */
  function actualiser() {
    if (!disponible()) {
      donnees.reinitialiser();
      sujetId = null;
      vueSujet?.liberer?.();
      vueSujet = null;
      retour.hidden = true;
      titre.textContent = "Todos";
    } else if (ouvert) {
      donnees.demarrer();
    }
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
    /** Tests: the open subject, or null. */
    sujetOuvert: () => sujetId,
    ouvrirSujet,
  };
}

