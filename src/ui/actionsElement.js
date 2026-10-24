import { A } from "../core/actions.js";
import { trouver } from "../core/arbre.js";
import { ouvrirEditionSite } from "./dialogues/dialogueSite.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { toast } from "./toast.js";

const CHAMPS_SAISIE = "input, textarea, select, [contenteditable]";

/**
 * Edit / delete behaviour of the tiles: context menu (right click or "⋯" button),
 * keyboard shortcuts on a focused tile, deletion with "Annuler".
 */
export function brancherActionsElements(store, conteneur, { lectureSeule = () => false } = {}) {
  const tuileDe = (id) => conteneur.querySelector(`.tuile[data-id="${CSS.escape(id)}"]`);

  const focaliserApresSuppression = (index) => {
    requestAnimationFrame(() => {
      const tuiles = [...conteneur.querySelectorAll(".tuile")];
      (tuiles[index] ?? tuiles[index - 1] ?? tuiles.at(-1))?.focus();
    });
  };

  const supprimer = (id) => {
    const r = trouver(store.lire().grille, id);
    if (!r) return;
    const parentId = r.parent?.id ?? null;
    const indexTuile = [...conteneur.querySelectorAll(".tuile")].indexOf(tuileDe(id));
    store.envoyer({ type: A.ELEMENT_SUPPRIMER, id });
    focaliserApresSuppression(Math.max(0, indexTuile));
    toast(`« ${r.element.titre} » supprimé`, {
      action: {
        libelle: "Annuler",
        onClic: () => {
          store.envoyer({
            type: A.ELEMENT_RESTAURER,
            element: r.element,
            parentId,
            index: r.index,
          });
          requestAnimationFrame(() => tuileDe(id)?.focus());
        },
      },
    });
  };

  const modifier = (id) => {
    const r = trouver(store.lire().grille, id);
    if (r?.element.type !== "site") return;
    ouvrirEditionSite(store, r.element, {
      apresModification: () => requestAnimationFrame(() => tuileDe(id)?.focus()),
    });
  };

  const copierLien = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié", { duree: 2500 });
    } catch {
      toast("Impossible de copier le lien", { type: "erreur" });
    }
  };

  const ouvrirMenuPour = (id, x, y) => {
    const r = trouver(store.lire().grille, id);
    if (!r) return;
    const e = r.element;
    const entrees = [];
    if (!lectureSeule())
      entrees.push({ libelle: "Modifier", raccourci: "F2", onChoix: () => modifier(id) });
    if (e.type === "site") {
      entrees.push(
        {
          libelle: "Ouvrir dans un nouvel onglet",
          onChoix: () => window.open(e.url, "_blank", "noopener"),
        },
        { libelle: "Copier le lien", onChoix: () => copierLien(e.url) },
      );
    }
    if (!lectureSeule()) {
      entrees.push("-", {
        libelle: "Supprimer",
        raccourci: "Suppr",
        danger: true,
        onChoix: () => supprimer(id),
      });
    }
    ouvrirMenu({ x, y, entrees, retourFocus: tuileDe(id), libelle: e.titre });
  };

  conteneur.addEventListener("contextmenu", (ev) => {
    const tuile = ev.target.closest(".tuile[data-id]");
    if (!tuile) return; // outside a tile: Chrome's own menu
    ev.preventDefault();
    ouvrirMenuPour(tuile.dataset.id, ev.clientX, ev.clientY);
  });

  conteneur.addEventListener("click", (ev) => {
    const bouton = ev.target.closest("[data-menu]");
    if (!bouton) return;
    ev.preventDefault();
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

  return { supprimer, modifier, ouvrirMenuPour };
}
