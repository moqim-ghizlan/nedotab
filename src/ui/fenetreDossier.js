import { A } from "../core/actions.js";
import { cheminVers, peutCreerDossierDans, trouver } from "../core/arbre.js";
import { creerDossier } from "../core/modele.js";
import { demanderNomDossier } from "./dialogues/commun.js";
import { ouvrirAjoutSite } from "./dialogues/dialogueSite.js";
import { el } from "./dom.js";
import { rendreFilAriane } from "./filAriane.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { PROFONDEUR_ATTEINTE } from "./messages.js";
import { rapatrierToasts, toast } from "./toast.js";
import { creerVueGrille } from "./vueGrille.js";

let ouverte = null;

/**
 * Folder window: one modal <dialog> over the home grid (never stacked). Opening a
 * sub-folder shows its content in the same window; the breadcrumb, the back button and
 * Escape go up one level. Same grid component as the home page. It follows the state while
 * open (other tab) and goes up, or closes, if the folder shown disappears.
 */
export function ouvrirFenetreDossier(
  store,
  dossierId,
  { retourFocus, lectureSeule = () => false, annoncer } = {},
) {
  ouverte?.fermer();
  const grille = () => store.lire().grille;
  const lire = (id) => {
    const r = trouver(grille(), id);
    return r?.element.type === "dossier" ? r.element : null;
  };
  if (!lire(dossierId)) return null;
  let courant = dossierId;
  let cheminConnu = cheminVers(grille(), courant).map((d) => d.id);

  // --- title of the current folder, editable in place -----------------------------------
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
    champTitre.value = lire(courant)?.titre ?? "";
    titre.hidden = true;
    champTitre.hidden = false;
    champTitre.focus();
    champTitre.select();
  };
  const finirEdition = (valider) => {
    if (!edition) return;
    edition = false;
    if (valider) store.envoyer({ type: A.DOSSIER_RENOMMER, id: courant, titre: champTitre.value });
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

  // --- header: back button, breadcrumb ----------------------------------------------------
  const retour = el("button", {
    type: "button",
    class: "fenetre-retour",
    "aria-label": "Dossier parent",
    texte: "←",
    onclick: () => remonter(),
  });
  const ariane = el("nav", { class: "fenetre-ariane", "aria-label": "Fil d'Ariane" });

  // --- body ------------------------------------------------------------------------------
  const grilleEl = el("ul", {
    class: "grille grille--dossier",
    "aria-labelledby": "fenetre-dossier-titre",
  });
  const videEl = el("p", { class: "fenetre-vide", texte: "Ce dossier est vide.", hidden: true });
  const corps = el("div", { class: "fenetre-corps" }, grilleEl, videEl);
  const dialogue = el(
    "dialog",
    { class: "fenetre-dossier", "aria-labelledby": "fenetre-dossier-titre" },
    el(
      "header",
      { class: "fenetre-entete" },
      el("div", { class: "fenetre-ligne" }, retour, ariane),
      el(
        "div",
        { class: "fenetre-ligne" },
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
    ),
    corps,
  );

  /** Shows folder `id` in the window; `focusId` gets the focus once rendered. */
  const aller = (id, { focusId, sens = 0 } = {}) => {
    if (id == null) {
      dialogue.close();
      return;
    }
    courant = id;
    cheminConnu = cheminVers(grille(), id).map((d) => d.id);
    corps.classList.remove("fenetre-corps--gauche", "fenetre-corps--droite");
    if (sens) {
      void corps.offsetWidth; // restart the slide animation
      corps.classList.add(sens > 0 ? "fenetre-corps--droite" : "fenetre-corps--gauche");
    }
    actualiser();
    const cible = focusId && grilleEl.querySelector(`.tuile[data-id="${CSS.escape(focusId)}"]`);
    (cible ?? grilleEl.querySelector(".tuile") ?? titre).focus();
  };
  /** One level up; at level 1, closes the window. */
  const remonter = () => {
    const parent = cheminVers(grille(), courant)?.at(-1)?.id ?? null;
    aller(parent, { focusId: courant, sens: -1 });
  };

  const ajouter = (bouton) => {
    const r = bouton.getBoundingClientRect();
    const possible = peutCreerDossierDans(grille(), courant);
    ouvrirMenu({
      x: r.left,
      y: r.bottom + 4,
      retourFocus: bouton,
      libelle: "Ajouter",
      entrees: [
        {
          libelle: "Ajouter un site",
          onChoix: () =>
            ouvrirAjoutSite(store, { parentId: courant, apresAjout: (s) => vue.focaliser(s.id) }),
        },
        {
          libelle: "Nouveau dossier",
          desactive: !possible,
          info: PROFONDEUR_ATTEINTE,
          onChoix: async () => {
            const nom = await demanderNomDossier({ retourFocus: bouton });
            if (nom == null) return;
            const dossier = creerDossier({ titre: nom.trim() || "Dossier" });
            store.envoyer({ type: A.DOSSIER_CREER, dossier, parentId: courant });
            vue.focaliser(dossier.id);
          },
        },
      ],
    });
  };

  const vue = creerVueGrille({
    store,
    conteneur: grilleEl,
    parentId: () => courant,
    lectureSeule,
    annoncer,
    libelleAjout: "Ajouter un site ou un dossier ici",
    ajouter,
    ouvrirDossier: (id) => aller(id, { sens: 1 }),
  });

  function actualiser() {
    let dossier = lire(courant);
    if (!dossier) {
      // Deleted or moved away elsewhere: go to the nearest folder still there.
      const ancetre = [...cheminConnu].reverse().find((id) => lire(id));
      if (!ancetre) {
        dialogue.close();
        toast("Ce dossier a été supprimé ailleurs.", { cle: "dossierVide" });
        return;
      }
      courant = ancetre;
      dossier = lire(courant);
    }
    const chemin = cheminVers(grille(), courant);
    cheminConnu = chemin.map((d) => d.id);
    rendreFilAriane(
      ariane,
      [
        { id: null, titre: "Accueil" },
        ...chemin.map((d) => ({ id: d.id, titre: d.titre })),
        dossier,
      ],
      {
        // Going up: the focus lands on the folder we came from at that level.
        aller: (id) => {
          const ids = [...cheminConnu, courant];
          aller(id, { focusId: ids[ids.indexOf(id) + 1], sens: -1 });
        },
      },
    );
    retour.hidden = chemin.length === 0;
    if (!edition) titre.textContent = dossier.titre;
    videEl.hidden = dossier.items.length > 0;
    vue.demanderRendu();
  }
  const desabonner = store.abonner(actualiser);

  // Click on the backdrop closes the window.
  dialogue.addEventListener("click", (e) => {
    if (e.target === dialogue) dialogue.close();
  });
  // Escape goes up one level; at level 1 it closes.
  dialogue.addEventListener("cancel", (e) => {
    if (edition) {
      e.preventDefault();
      return;
    }
    if (cheminVers(grille(), courant)?.length) {
      e.preventDefault();
      remonter();
    }
  });
  dialogue.addEventListener("close", () => {
    desabonner();
    vue.detruire();
    rapatrierToasts();
    dialogue.remove();
    if (ouverte?.dialogue === dialogue) ouverte = null;
    // Focus back on the home tile of the folder (re-rendered meanwhile: find it again).
    const racine = cheminVers(grille(), courant)?.[0]?.id ?? courant;
    const tuile =
      document.querySelector(
        `.grille:not(.grille--dossier) .tuile[data-id="${CSS.escape(racine)}"]`,
      ) ?? (retourFocus?.isConnected ? retourFocus : null);
    tuile?.focus();
  });

  document.body.append(dialogue);
  actualiser();
  dialogue.showModal();
  (grilleEl.querySelector(".tuile") ?? titre).focus();
  ouverte = { dialogue, fermer: () => dialogue.close(), aller };
  return ouverte;
}
