import { A } from "../core/actions.js";
import { cheminVers, peutCreerDossierDans, peutPlacer, trouver } from "../core/arbre.js";
import { creerDossier } from "../core/modele.js";
import { comptesDe } from "../core/pages.js";
import { demanderNomDossier } from "./dialogues/commun.js";
import { ouvrirAjoutSite } from "./dialogues/dialogueSite.js";
import { el } from "./dom.js";
import { rendreFilAriane } from "./filAriane.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { PROFONDEUR_ATTEINTE, RAISONS } from "./messages.js";
import { rapatrierToasts, toast } from "./toast.js";
import { creerVueGrille } from "./vueGrille.js";

let ouverte = null;

/** Time out of the window (or over its header) before the folder lets the icon go. */
export const DELAI_SORTIE_MS = 400;

/**
 * Folder window: one modal <dialog> over the home grid (never stacked). Opening a
 * sub-folder shows its content in the same window; the breadcrumb, the back button and
 * Escape go up one level. Same grid component as the home page. It follows the state while
 * open (other tab) and goes up, or closes, if the folder shown disappears.
 *
 * Taking an icon out (V3.10.1), as on the iPhone: dragged out of the window, or up over its
 * header (the window fills a phone), for DELAI_SORTIE_MS, the window fades away and the
 * home grid shows; the icon is dropped there, where the finger is (`versAccueil` gives the
 * place), and the window closes. Hovering the breadcrumb still works as before.
 */
export function ouvrirFenetreDossier(
  store,
  dossierId,
  {
    retourFocus,
    lectureSeule = () => false,
    annoncer = () => {},
    editerTitre = false,
    versAccueil = null,
  } = {},
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
  const aller = (id, { focusId, sens = 0, editerTitre: editer = false } = {}) => {
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
    if (editer) commencerEdition();
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

  // --- taking an icon out onto the home grid ---------------------------------------------------
  let sortie = null; // during a drag: { x, y, minuteur, active, repere }
  const marquer = (position) => {
    sortie.repere?.classList.remove("case--insertion-avant", "case--insertion-apres");
    sortie.repere = position?.repere ?? null;
    sortie.repere?.classList.add(
      position.apres ? "case--insertion-apres" : "case--insertion-avant",
    );
  };
  /** Out of the window, or over its header, but not on a breadcrumb segment (own target). */
  const dehors = (x, y) => {
    const r = dialogue.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true;
    if (y >= corps.getBoundingClientRect().top) return false;
    return !document.elementsFromPoint(x, y).some((n) => n.closest?.(".ariane-segment"));
  };
  const activerSortie = () => {
    sortie.minuteur = null;
    sortie.active = true;
    dialogue.classList.add("fenetre-dossier--sortie");
    marquer(versAccueil(sortie.x, sortie.y));
    annoncer("Déposez l'icône sur l'accueil");
  };
  const suivreSortie = (e) => {
    if (!sortie) return;
    sortie.x = e.clientX;
    sortie.y = e.clientY;
    if (sortie.active) {
      marquer(versAccueil(e.clientX, e.clientY));
    } else if (!dehors(e.clientX, e.clientY)) {
      clearTimeout(sortie.minuteur);
      sortie.minuteur = null;
    } else {
      sortie.minuteur ??= setTimeout(activerSortie, DELAI_SORTIE_MS);
    }
  };
  const glisserHors = versAccueil && {
    debut: () => {
      sortie = { x: 0, y: 0, minuteur: null, active: false, repere: null };
      document.addEventListener("pointermove", suivreSortie, true);
    },
    fin: () => {
      document.removeEventListener("pointermove", suivreSortie, true);
      if (!sortie) return;
      clearTimeout(sortie.minuteur);
      marquer(null);
      sortie = null;
      dialogue.classList.remove("fenetre-dossier--sortie");
    },
    active: () => !!sortie?.active,
    deposer: (id) => {
      const g = grille();
      const element = trouver(g, id)?.element;
      const position = versAccueil(sortie.x, sortie.y);
      const verdict = peutPlacer(g, id, null);
      if (!element || !verdict.ok) {
        toast(RAISONS[verdict.raison] ?? "Déplacement impossible", { type: "erreur", duree: 4000 });
        return;
      }
      const avant = g;
      const pages = comptesDe(store.lire());
      store.envoyer({
        type: A.ELEMENT_DEPLACER,
        id,
        versParentId: null,
        ...(position?.vers ?? {}),
      });
      toast(`« ${element.titre} » placé sur l'accueil`, {
        action: {
          libelle: "Annuler",
          onClic: () => store.envoyer({ type: A.GRILLE_REMPLACER, grille: avant, pages }),
        },
      });
      // The icon has left the folder: back to the home grid (after SortableJS is done).
      setTimeout(() => dialogue.open && dialogue.close(), 0);
    },
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
    apresFusion: (id) => aller(id, { sens: 1, editerTitre: true }),
    sortie: glisserHors || null,
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

  // Click on the backdrop closes the window, unless the user turned that off (V4.5.1).
  dialogue.addEventListener("click", (e) => {
    if (e.target === dialogue && !store.lire().reglages.gardeDossierOuvert) dialogue.close();
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
  if (editerTitre) commencerEdition();
  ouverte = { dialogue, fermer: () => dialogue.close(), aller };
  return ouverte;
}
