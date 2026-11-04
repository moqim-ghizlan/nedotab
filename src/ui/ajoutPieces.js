import { dossiersCibles, emplacementValide } from "../core/ajoutRapide.js";
import { domaine } from "../core/url.js";
import { el } from "./dom.js";
import { creerSelecteurDossier } from "./selecteurDossier.js";
import { creerIcone } from "./tuile.js";

/** Pieces shared by the page dialog and the toolbar popup of "Ajouter un site" (T3). */

/** An input with a floating label (the input needs a placeholder for :placeholder-shown). */
export function champFlottant(input, libelle) {
  if (!input.getAttribute("placeholder")) input.setAttribute("placeholder", " ");
  return el(
    "div",
    { class: "champ-flottant" },
    input,
    el("label", { for: input.id, texte: libelle }),
  );
}

/**
 * The tile about to be created, drawn large; `maj` redraws it (live while typing).
 * @param {() => { titre: string, url: string }} lireSite
 */
export function creerApercuAjout(lireSite) {
  const racine = el("div", { class: "ajout-apercu", "aria-hidden": "true" });
  return {
    racine,
    maj(icone, enCours = false) {
      const { titre, url } = lireSite();
      const nom = titre || (url ? domaine(url) : "Nouveau site");
      racine.classList.toggle("ajout-apercu--vide", !url);
      racine.replaceChildren(
        el(
          "div",
          { class: "ajout-apercu-icone" },
          creerIcone({ titre: nom, url, icone }),
          enCours ? el("span", { class: "ajout-apercu-attente" }) : null,
        ),
        el(
          "div",
          { class: "ajout-apercu-texte" },
          el("span", { class: "ajout-apercu-titre", texte: nom }),
          el("span", {
            class: "ajout-apercu-domaine",
            texte: url ? domaine(url) : "Saisissez une adresse",
          }),
        ),
      );
    },
  };
}

/**
 * "Emplacement": a button showing the path, which unfolds the shared folder tree (T1).
 * `lire()` gives the folder id (null = home).
 */
export function creerChampLieu({
  grille,
  selection = null,
  id = "ajout-lieu",
  onChoix = () => {},
}) {
  const cibles = dossiersCibles(grille);
  const chemin = (dossierId) => cibles.find((c) => c.id === dossierId)?.chemin ?? "Accueil";
  const depart = emplacementValide(grille, selection);
  const texte = el("span", { class: "ajout-lieu-texte", texte: chemin(depart) });
  const panneau = el("div", { class: "ajout-lieu-panneau", id: `${id}-panneau`, hidden: true });
  const bouton = el(
    "button",
    {
      type: "button",
      id,
      class: "ajout-lieu",
      "aria-expanded": "false",
      "aria-controls": `${id}-panneau`,
      onclick: () => {
        panneau.hidden = !panneau.hidden;
        bouton.setAttribute("aria-expanded", String(!panneau.hidden));
        if (!panneau.hidden) selecteur.focus();
      },
    },
    el("span", { class: "destination-icone", "aria-hidden": "true", texte: "▣" }),
    texte,
    el("span", { class: "ajout-lieu-fleche", "aria-hidden": "true", texte: "▾" }),
  );
  const fermer = () => {
    panneau.hidden = true;
    bouton.setAttribute("aria-expanded", "false");
    bouton.focus();
  };
  const selecteur = creerSelecteurDossier({
    grille,
    selection: depart,
    apercu: true,
    onChoix: (dossierId) => {
      texte.textContent = chemin(dossierId);
      onChoix(dossierId);
    },
    onValider: fermer,
  });
  panneau.append(selecteur.racine);
  return {
    racine: el("div", { class: "ajout-lieu-champ" }, bouton, panneau),
    lire: () => selecteur.lire() ?? null,
    definir: (dossierId) => {
      selecteur.definir(dossierId || null);
      texte.textContent = chemin(dossierId || null);
    },
    chemin,
  };
}
