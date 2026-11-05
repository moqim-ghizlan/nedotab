import { A } from "../../core/actions.js";
import { trouver } from "../../core/arbre.js";
import {
  NOMBRE_ACCUEIL_MAX,
  NOMBRE_ACCUEIL_MIN,
  frequentsDe,
} from "../../core/frequents.js";
import { el } from "../dom.js";

/**
 * Settings → Appearance → "Les plus utilisés" (V4.22): show the row, show its small title,
 * and the sites hidden from it (each with "Réafficher"). Synced like the other settings.
 */
export function creerSectionFrequents({ store }) {
  const modifier = (changements) =>
    store.envoyer({
      type: A.REGLAGES_MODIFIER,
      changements: { frequents: { ...frequentsDe(store.lire().reglages), ...changements } },
    });

  const interrupteur = (cle, libelle, note) => {
    const bouton = el("input", {
      type: "checkbox",
      role: "switch",
      class: "interrupteur-bouton",
      dataset: { reglage: `frequents-${cle}` },
      onchange: (e) => modifier({ [cle]: e.currentTarget.checked }),
    });
    return {
      cle,
      bouton,
      ligne: el(
        "label",
        { class: "interrupteur" },
        el(
          "span",
          { class: "interrupteur-texte" },
          el("span", { texte: libelle }),
          el("span", { class: "reglages-note", texte: note }),
        ),
        bouton,
      ),
    };
  };
  const afficher = interrupteur(
    "afficher",
    "Afficher la rangée « Les plus utilisés »",
    "Une ligne de raccourcis sous la barre de recherche, vers les sites que vous ouvrez le plus.",
  );
  const titre = interrupteur(
    "titre",
    "Afficher le petit titre au-dessus",
    "Par défaut, la rangée parle d'elle-même.",
  );
  const accueil = interrupteur(
    "accueil",
    "Afficher les sites les plus utilisés sur l'accueil",
    "Une bande de raccourcis au-dessus de la barre de recherche, mise à jour après chaque site ouvert.",
  );
  // Segmented choice 4 to 10, like "Colonnes par page".
  const valeurs = Array.from(
    { length: NOMBRE_ACCUEIL_MAX - NOMBRE_ACCUEIL_MIN + 1 },
    (_, i) => NOMBRE_ACCUEIL_MIN + i,
  );
  const groupe = el("div", {
    class: "segments",
    role: "radiogroup",
    "aria-label": "Nombre de sites sur l'accueil",
    dataset: { reglage: "frequents-nombreAccueil" },
  });
  const nombre = { value: String(frequentsDe(store.lire().reglages).nombreAccueil) };
  const marquer = () => {
    for (const b of groupe.children)
      b.setAttribute("aria-checked", String(b.dataset.valeur === nombre.value));
  };
  for (const n of valeurs) {
    groupe.append(
      el("button", {
        type: "button",
        class: "segment",
        role: "radio",
        dataset: { valeur: String(n) },
        texte: String(n),
        "aria-label": `${n} sites`,
        onclick: () => {
          nombre.value = String(n);
          marquer();
          modifier({ nombreAccueil: n });
        },
      }),
    );
  }
  marquer();
  const curseurNombre = { maj: marquer };
  const majAria = () => {};
  const ligneNombre = el(
    "div",
    { class: "reglages-curseur" },
    el("p", { class: "reglages-libelle", texte: "Nombre de sites sur l'accueil" }),
    groupe,
  );
  const note = el("p", { class: "reglages-note", hidden: true });
  const masques = el("ul", { class: "reglages-liste" });
  const entete = el("p", { class: "reglages-libelle", texte: "Sites masqués de la rangée" });

  const maj = (suiviActif = true) => {
    const f = frequentsDe(store.lire().reglages);
    afficher.bouton.checked = f.afficher;
    titre.bouton.checked = f.titre;
    accueil.bouton.checked = f.accueil;
    nombre.value = String(f.nombreAccueil);
    curseurNombre.maj();
    majAria();
    ligneNombre.hidden = !f.accueil;
    note.hidden = suiviActif;
    note.textContent =
      "« Mémoriser les sites que j'ouvre » est désactivé : la rangée n'affiche que les sites épinglés (au moins 3).";
    const lignes = f.masques
      .map((id) => trouver(store.lire().grille, id)?.element)
      .filter(Boolean)
      .map((site) =>
        el(
          "li",
          { class: "reglages-ligne" },
          el("span", { texte: site.titre }),
          el("button", {
            type: "button",
            class: "lien-discret",
            texte: "Réafficher",
            "aria-label": `Réafficher ${site.titre} dans la rangée`,
            onclick: () => modifier({ masques: f.masques.filter((m) => m !== site.id) }),
          }),
        ),
      );
    masques.replaceChildren(...lignes);
    masques.hidden = entete.hidden = lignes.length === 0;
  };
  maj();

  return {
    section: el(
      "section",
      { class: "reglages-section" },
      el("h3", { texte: "Les plus utilisés" }),
      accueil.ligne,
      ligneNombre,
      afficher.ligne,
      titre.ligne,
      note,
      entete,
      masques,
    ),
    maj,
  };
}
