import { A } from "../core/actions.js";
import { compterSites, peutCreerDossierDans, trouver } from "../core/arbre.js";
import { creerDossier } from "../core/modele.js";
import { comptesDe, positionDans } from "../core/pages.js";
import { demander, demanderNomDossier } from "./dialogues/commun.js";
import { ouvrirDeplacerVers } from "./dialogues/deplacerVersArbre.js";
import { ouvrirEditionSite } from "./dialogues/dialogueSite.js";
import { PROFONDEUR_ATTEINTE } from "./messages.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { ecranTactile, fermerMenuTactile, ouvrirMenuTactile } from "./menuTactile.js";
import { toast } from "./toast.js";
import { enEdition } from "./modeEdition.js";
import { ouvrirSite } from "./tuile.js";

const CHAMPS_SAISIE = "input, textarea, select, [contenteditable]";

/**
 * Edit / delete behaviour of the tiles of one grid level: context menu (right click or "⋯"
 * button), keyboard shortcuts on a focused tile, deletion with "Annuler".
 */
export function brancherActionsElements(
  store,
  conteneur,
  { lectureSeule = () => false, ouvrirDossier } = {},
) {
  const tuileDe = (id) => conteneur.querySelector(`.tuile[data-id="${CSS.escape(id)}"]`);
  const focaliser = (id) => requestAnimationFrame(() => tuileDe(id)?.focus());

  const focaliserApresSuppression = (index) => {
    requestAnimationFrame(() => {
      const tuiles = [...conteneur.querySelectorAll(".tuile")];
      (tuiles[index] ?? tuiles[index - 1] ?? tuiles.at(-1))?.focus();
    });
  };

  /** Runs `action`, then offers "Annuler" that puts the whole grid (and its pages) back. */
  const avecAnnulation = (message, action, idAFocaliser) => {
    const avant = store.lire().grille;
    const pages = comptesDe(store.lire());
    store.envoyer(action);
    toast(message, {
      action: {
        libelle: "Annuler",
        onClic: () => {
          store.envoyer({ type: A.GRILLE_REMPLACER, grille: avant, pages });
          if (idAFocaliser) focaliser(idAFocaliser);
        },
      },
    });
  };

  const supprimerSite = (r) => {
    const id = r.element.id;
    const indexTuile = [...conteneur.querySelectorAll(".tuile")].indexOf(tuileDe(id));
    // Home: the page it was on, to put it back there (V2.12).
    const page = r.parent ? undefined : positionDans(comptesDe(store.lire()), r.index)?.page;
    store.envoyer({ type: A.ELEMENT_SUPPRIMER, id });
    focaliserApresSuppression(Math.max(0, indexTuile));
    toast(`« ${r.element.titre} » supprimé`, {
      action: {
        libelle: "Annuler",
        onClic: () => {
          store.envoyer({
            type: A.ELEMENT_RESTAURER,
            element: r.element,
            parentId: r.parent?.id ?? null,
            index: r.index,
            page,
          });
          focaliser(id);
        },
      },
    });
  };

  const supprimerDossier = async (r) => {
    const d = r.element;
    const indexTuile = [...conteneur.querySelectorAll(".tuile")].indexOf(tuileDe(d.id));
    if (d.items.length === 0) {
      avecAnnulation(
        `Dossier « ${d.titre} » supprimé`,
        { type: A.DOSSIER_SUPPRIMER, id: d.id, mode: "avecContenu" },
        d.id,
      );
      focaliserApresSuppression(Math.max(0, indexTuile));
      return;
    }
    const n = compterSites(d);
    const mode = await demander({
      titre: "Supprimer le dossier",
      message: `Supprimer le dossier « ${d.titre} » et ses ${n} site${n > 1 ? "s" : ""} ?`,
      boutons: [
        { libelle: "Annuler", valeur: null },
        { libelle: "Tout supprimer", valeur: "avecContenu", danger: true },
        { libelle: "Garder les sites dans l'accueil", valeur: "viderDansParent", principal: true },
      ],
      retourFocus: tuileDe(d.id),
    });
    if (!mode) return;
    avecAnnulation(
      mode === "avecContenu"
        ? `Dossier « ${d.titre} » et son contenu supprimés`
        : `Dossier « ${d.titre} » supprimé, sites conservés`,
      { type: A.DOSSIER_SUPPRIMER, id: d.id, mode },
      d.id,
    );
    focaliserApresSuppression(Math.max(0, indexTuile));
  };

  const supprimer = (id) => {
    const r = trouver(store.lire().grille, id);
    if (!r) return;
    if (r.element.type === "dossier") supprimerDossier(r);
    else supprimerSite(r);
  };

  const renommerDossier = async (dossier) => {
    const titre = await demanderNomDossier({
      titre: "Renommer le dossier",
      libelleValider: "Renommer",
      valeur: dossier.titre,
      retourFocus: tuileDe(dossier.id),
    });
    if (titre != null) store.envoyer({ type: A.DOSSIER_RENOMMER, id: dossier.id, titre });
  };

  const modifier = (id) => {
    const r = trouver(store.lire().grille, id);
    if (!r) return;
    if (r.element.type === "dossier") {
      renommerDossier(r.element);
      return;
    }
    ouvrirEditionSite(store, r.element, { apresModification: () => focaliser(id) });
  };

  const creerDossierAvec = async (r) => {
    const titre = await demanderNomDossier({ retourFocus: tuileDe(r.element.id) });
    if (titre == null) return;
    const dossier = creerDossier({ titre: titre.trim() || "Dossier" });
    store.envoyer({
      type: A.DOSSIER_CREER,
      dossier,
      parentId: r.parent?.id ?? null,
      index: r.index,
      idsAInclure: [r.element.id],
    });
    focaliser(dossier.id);
  };

  const copierLien = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié", { duree: 2500 });
    } catch {
      toast("Impossible de copier le lien", { type: "erreur" });
    }
  };

  const partager = async (e) => {
    try {
      await navigator.share({ title: e.titre, url: e.url });
    } catch {
      // Closed by the user: nothing to report.
    }
  };

  /**
   * The single catalogue of actions of an element (V3.6): the mouse menu and the touch
   * sheet both show exactly this list. "Partager" only exists where the system can share.
   */
  const entreesPour = (id) => {
    const r = trouver(store.lire().grille, id);
    if (!r) return null;
    const e = r.element;
    const modifiable = !lectureSeule();
    const entrees = [];
    const deplacerVers = {
      libelle: "Déplacer vers…",
      onChoix: () => ouvrirDeplacerVers(store, id, { retourFocus: tuileDe(id) }),
    };
    if (e.type === "dossier") {
      entrees.push({ libelle: "Ouvrir", onChoix: () => ouvrirDossier?.(id, tuileDe(id)) });
      if (modifiable) {
        entrees.push(
          { libelle: "Renommer", raccourci: "F2", onChoix: () => renommerDossier(e) },
          deplacerVers,
        );
      }
    } else {
      if (modifiable)
        entrees.push({ libelle: "Modifier", raccourci: "F2", onChoix: () => modifier(id) });
      entrees.push(
        {
          libelle: "Ouvrir dans un nouvel onglet",
          onChoix: () => ouvrirSite(e.url, { nouvelOnglet: true }),
        },
        { libelle: "Copier le lien", onChoix: () => copierLien(e.url) },
      );
      if (typeof navigator.share === "function")
        entrees.push({ libelle: "Partager…", onChoix: () => partager(e) });
      if (modifiable) {
        entrees.push(deplacerVers, {
          libelle: "Créer un dossier avec ce site",
          desactive: !peutCreerDossierDans(store.lire().grille, r.parent?.id ?? null),
          info: PROFONDEUR_ATTEINTE,
          onChoix: () => creerDossierAvec(r),
        });
      }
    }
    if (modifiable) {
      entrees.push("-", {
        libelle: "Supprimer",
        raccourci: "Suppr",
        danger: true,
        onChoix: () => supprimer(id),
      });
    }
    return { entrees, libelle: e.titre };
  };

  const ouvrirMenuPour = (id, x, y) => {
    const catalogue = entreesPour(id);
    if (!catalogue) return;
    // Finger (V3.6): sheet or menu anchored to the tile, same entries.
    if (ecranTactile() && tuileDe(id)) {
      ouvrirMenuTactile({ ...catalogue, tuile: tuileDe(id) });
      return;
    }
    ouvrirMenu({ x, y, ...catalogue, retourFocus: tuileDe(id) });
  };

  // Long press without moving (appuiLong.js): the actions; a drag starting after it closes them.
  conteneur.addEventListener("appuilong", (ev) => {
    const tuile = ev.target.closest(".tuile[data-id]");
    const catalogue = tuile && entreesPour(tuile.dataset.id);
    if (catalogue) ouvrirMenuTactile({ ...catalogue, tuile });
  });
  conteneur.addEventListener("appuilongannule", fermerMenuTactile);

  conteneur.addEventListener("contextmenu", (ev) => {
    const tuile = ev.target.closest(".tuile[data-id]");
    if (!tuile) return; // outside a tile: Chrome's own menu
    ev.preventDefault();
    ouvrirMenuPour(tuile.dataset.id, ev.clientX, ev.clientY);
  });

  conteneur.addEventListener(
    "click",
    (ev) => {
      if (!enEdition()) return;
      const retirer = ev.target.closest("[data-retirer]");
      // In "Modifier la grille" a tap deletes with the "−" and does not open a site.
      if (!retirer && !ev.target.closest(".tuile:not(.tuile--dossier)")) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (retirer && !lectureSeule()) supprimer(retirer.dataset.retirer);
    },
    true,
  );

  conteneur.addEventListener("click", (ev) => {
    const bouton = ev.target.closest("[data-menu]");
    if (!bouton) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = bouton.getBoundingClientRect();
    ouvrirMenuPour(bouton.dataset.menu, rect.left, rect.bottom + 4);
  });

  conteneur.addEventListener("keydown", (ev) => {
    if (ev.target.closest(CHAMPS_SAISIE)) return;
    const tuile = ev.target.closest(".tuile[data-id]");
    if (!tuile) return;
    const id = tuile.dataset.id;
    if ((ev.key === "F10" && ev.shiftKey) || ev.key === "ContextMenu") {
      ev.preventDefault();
      const rect = tuile.getBoundingClientRect();
      ouvrirMenuPour(id, rect.left + rect.width / 2, rect.bottom);
    } else if (lectureSeule() || ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    } else if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      supprimer(id);
    } else if (ev.key === "F2" || ev.key === "e" || ev.key === "E") {
      ev.preventDefault();
      modifier(id);
    }
  });

  return { supprimer, modifier, ouvrirMenuPour, entreesPour };
}
