import { A } from "../../core/actions.js";
import { deplacer, listerDossiers, trouver } from "../../core/arbre.js";
import { el } from "../dom.js";
import { demander } from "./commun.js";

/**
 * "Déplacer vers…": lists the home grid and every folder. The current place is disabled,
 * and so is any destination the move would not be allowed into.
 * Resolves to the chosen parent id (null = home) or undefined when cancelled.
 */
export async function ouvrirDeplacerVers(store, id, { retourFocus } = {}) {
  const grille = store.lire().grille;
  const r = trouver(grille, id);
  if (!r) return undefined;
  const actuel = r.parent?.id ?? null;
  const destinations = [
    { id: null, titre: "Accueil", niveau: 0 },
    ...listerDossiers(grille).map(({ dossier, niveau }) => ({
      id: dossier.id,
      titre: dossier.titre,
      niveau,
    })),
  ];
  let choix;
  const liste = el(
    "div",
    { class: "destinations", role: "listbox", "aria-label": "Destinations" },
    destinations.map((d) => {
      // One level of folders for now: a folder can only go back to the home grid.
      const imbrique = r.element.type === "dossier" && d.id != null;
      const possible = !imbrique && (d.id === actuel || deplacer(grille, id, d.id) !== grille);
      const desactive = d.id === actuel || !possible;
      return el(
        "button",
        {
          type: "button",
          class: "destination",
          role: "option",
          style: `padding-left:${12 + d.niveau * 18}px`,
          disabled: desactive,
          "aria-disabled": desactive ? "true" : null,
          onclick: () => {
            choix = d.id;
            liste.closest("dialog").close();
          },
        },
        el("span", { class: "destination-icone", "aria-hidden": "true", texte: d.id ? "▣" : "⌂" }),
        el("span", { texte: d.titre }),
        d.id === actuel ? el("span", { class: "destination-note", texte: "(actuel)" }) : null,
      );
    }),
  );
  liste.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const actifs = [...liste.querySelectorAll(".destination:not([disabled])")];
    const i = actifs.indexOf(document.activeElement);
    e.preventDefault();
    actifs[(i + (e.key === "ArrowDown" ? 1 : -1) + actifs.length) % actifs.length]?.focus();
  });
  await demander({
    titre: `Déplacer « ${r.element.titre} » vers…`,
    contenu: [liste],
    boutons: [{ libelle: "Annuler", valeur: false }],
    retourFocus,
  });
  if (choix === undefined) return undefined;
  store.envoyer({ type: A.ELEMENT_DEPLACER, id, versParentId: choix });
  return choix;
}
