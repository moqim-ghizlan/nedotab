import { A } from "../core/actions.js";
import { trouver } from "../core/arbre.js";
import { ouvrirAjoutSite } from "./dialogues/dialogueSite.js";
import { el } from "./dom.js";
import { rapatrierToasts, toast } from "./toast.js";
import { creerVueGrille } from "./vueGrille.js";

let ouverte = null;

/**
 * Folder window: a modal <dialog> over the home grid, with an editable title and the same
 * grid component as the home page (re-orderable, "+" adds a site in this folder).
 * It follows the state while open (other tab) and closes if the folder disappears.
 */
export function ouvrirFenetreDossier(
  store,
  dossierId,
  { retourFocus, lectureSeule = () => false, annoncer } = {},
) {
  ouverte?.fermer();
  const lire = () => {
    const r = trouver(store.lire().grille, dossierId);
    return r?.element.type === "dossier" ? r.element : null;
  };
  if (!lire()) return null;

  // --- title, editable in place --------------------------------------------------------
  const titre = el("button", {
    type: "button",
    class: "fenetre-titre",
    id: "fenetre-dossier-titre",
    title: "Renommer",
  });
  const champTitre = el("input", {
    type: "text",
    class: "fenetre-titre-champ",
    maxlength: "40",
    autocomplete: "off",
    "aria-label": "Nom du dossier",
    hidden: true,
  });
  let edition = false;
  const commencerEdition = () => {
    if (lectureSeule()) return;
    edition = true;
    champTitre.value = lire()?.titre ?? "";
    titre.hidden = true;
    champTitre.hidden = false;
    champTitre.focus();
    champTitre.select();
  };
  const finirEdition = (valider) => {
    if (!edition) return;
    edition = false;
    if (valider)
      store.envoyer({ type: A.DOSSIER_RENOMMER, id: dossierId, titre: champTitre.value });
    champTitre.hidden = true;
    titre.hidden = false;
    titre.focus();
  };
  titre.addEventListener("click", commencerEdition);
  champTitre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finirEdition(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finirEdition(false);
    }
  });
  champTitre.addEventListener("blur", () => finirEdition(true));

  // --- body ------------------------------------------------------------------------------
  const grilleEl = el("ul", {
    class: "grille grille--dossier",
    "aria-labelledby": "fenetre-dossier-titre",
  });
  const videEl = el("p", { class: "fenetre-vide", texte: "Ce dossier est vide.", hidden: true });
  const dialogue = el(
    "dialog",
    { class: "fenetre-dossier", "aria-labelledby": "fenetre-dossier-titre" },
    el(
      "header",
      { class: "fenetre-entete" },
      titre,
      champTitre,
      el("button", {
        type: "button",
        class: "fenetre-fermer",
        "aria-label": "Fermer",
        texte: "×",
        onclick: () => dialogue.close(),
      }),
    ),
    el("div", { class: "fenetre-corps" }, grilleEl, videEl),
  );

  const vue = creerVueGrille({
    store,
    conteneur: grilleEl,
    parentId: () => dossierId,
    lectureSeule,
    annoncer,
    libelleAjout: "Ajouter un site dans ce dossier",
    ajouter: () =>
      ouvrirAjoutSite(store, { parentId: dossierId, apresAjout: (site) => vue.focaliser(site.id) }),
    // One level of folders for now: there is no folder inside a folder.
    ouvrirDossier: () => {},
  });

  const actualiser = () => {
    const dossier = lire();
    if (!dossier) {
      dialogue.close();
      toast("Ce dossier a été supprimé ailleurs.", { cle: "dossierVide" });
      return;
    }
    titre.textContent = dossier.titre;
    videEl.hidden = dossier.items.length > 0;
    vue.demanderRendu();
  };
  const desabonner = store.abonner(actualiser);

  // Click on the backdrop closes the window.
  dialogue.addEventListener("click", (e) => {
    if (e.target === dialogue) dialogue.close();
  });
  dialogue.addEventListener("cancel", (e) => {
    if (edition) e.preventDefault();
  });
  dialogue.addEventListener("close", () => {
    desabonner();
    vue.detruire();
    rapatrierToasts();
    dialogue.remove();
    if (ouverte?.dialogue === dialogue) ouverte = null;
    // The tile may have been re-rendered while the window was open: find it again.
    const tuile = retourFocus?.isConnected
      ? retourFocus
      : document.querySelector(`.tuile[data-id="${CSS.escape(dossierId)}"]`);
    tuile?.focus();
  });

  document.body.append(dialogue);
  actualiser();
  dialogue.showModal();
  (grilleEl.querySelector(".tuile") ?? titre).focus();
  ouverte = { dialogue, fermer: () => dialogue.close() };
  return ouverte;
}
