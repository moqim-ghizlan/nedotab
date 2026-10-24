import { parcourir } from "../../core/arbre.js";
import { dateCourte } from "../../core/fusion.js";
import { el } from "../dom.js";
import { creerIcone } from "../tuile.js";
import { demander } from "./commun.js";

function colonne(titre, cote) {
  const sites = [...parcourir(cote.grille)].filter((e) => e.type === "site").slice(0, 8);
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  return el(
    "div",
    { class: "choix-cote" },
    el("h3", { texte: titre }),
    el("p", {
      class: "reglages-note",
      texte: `${pluriel(cote.sites, "site")}, ${pluriel(cote.dossiers, "dossier")}`,
    }),
    cote.majLe
      ? el("p", { class: "reglages-note", texte: `Modifiés le ${dateCourte(cote.majLe)}` })
      : null,
    el(
      "div",
      { class: "choix-apercu", "aria-hidden": "true" },
      sites.map((s) => creerIcone(s)),
    ),
  );
}

/**
 * "Des sites existent déjà sur votre compte": shows both sides with concrete numbers, then
 * resolves to "compte", "local", "fusion" or null (cancel = stay in local mode).
 * Merging is the highlighted choice: it cannot lose anything.
 */
export function demanderChoixPremiereSynchro(resume) {
  return demander({
    titre: "Des sites existent déjà sur votre compte",
    message:
      "Choisissez ce que vous gardez. Les sites de cet ordinateur sont copiés en sécurité avant tout changement.",
    contenu: [
      el(
        "div",
        { class: "choix-synchro" },
        colonne("Sur votre compte", resume.compte),
        colonne("Sur cet ordinateur", resume.local),
      ),
    ],
    boutons: [
      { libelle: "Annuler", valeur: null },
      { libelle: "Garder ceux du compte", valeur: "compte" },
      { libelle: "Garder ceux de cet ordinateur", valeur: "local" },
      { libelle: "Fusionner les deux", valeur: "fusion", principal: true },
    ],
  });
}
