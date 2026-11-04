import { parcourir } from "../../core/arbre.js";
import { dateCourte } from "../../core/fusion.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { creerIcone } from "../tuile.js";
import { demander } from "./commun.js";

const CONSEQUENCES = {
  fusion: "Tous les sites des deux côtés sont gardés. Rien n'est perdu.",
  compte: "Les sites de cet appareil sont remplacés par ceux de votre compte.",
  local: "Les sites de votre compte sont remplacés par ceux de cet appareil.",
};

let compteur = 0;

/** A choice drawn as a card: the whole card is the radio button. */
function carte({ valeur, nom, classe = "", coche = false }, ...contenu) {
  const radio = el("input", {
    type: "radio",
    name: nom,
    value: valeur,
    class: "choix-radio",
    checked: coche,
  });
  const noeud = el(
    "label",
    { class: `choix-cote ${classe}`.trim() },
    radio,
    el("span", { class: "choix-coche", "aria-hidden": "true" }, icone("coche", { taille: 14 })),
    ...contenu,
  );
  return { noeud, radio };
}

function contenuCote(titre, cote) {
  const sites = [...parcourir(cote.grille)].filter((e) => e.type === "site").slice(0, 8);
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  return [
    el("strong", { class: "choix-titre", texte: titre }),
    el("span", {
      class: "choix-chiffres",
      texte: `${pluriel(cote.sites, "site")}, ${pluriel(cote.dossiers, "dossier")}`,
    }),
    cote.majLe ? el("span", { class: "choix-chiffres", texte: `Modifiés le ${dateCourte(cote.majLe)}` }) : null,
    el(
      "div",
      { class: "choix-apercu", "aria-hidden": "true" },
      sites.map((s) => creerIcone(s)),
    ),
  ];
}

/**
 * "Des sites existent déjà sur votre compte": two cards to pick from (the account, this
 * device) and a third to merge both, then "Continuer". Resolves to "compte", "local",
 * "fusion" or null (cancel = stay in local mode). Merging is chosen at first: it cannot lose
 * anything.
 */
export function demanderChoixPremiereSynchro(resume) {
  const nom = `choix-synchro-${++compteur}`;
  const compte = carte({ valeur: "compte", nom }, ...contenuCote("Sur votre compte", resume.compte));
  const local = carte({ valeur: "local", nom }, ...contenuCote("Sur cet appareil", resume.local));
  const fusion = carte(
    { valeur: "fusion", nom, classe: "choix-fusion", coche: true },
    el("strong", { class: "choix-titre", texte: "Fusionner les deux" }),
    el("span", { class: "choix-recommande", texte: "Recommandé" }),
    el("span", { class: "choix-chiffres", texte: "Garde les sites des deux côtés." }),
  );
  const consequence = el("p", {
    class: "choix-consequence",
    "aria-live": "polite",
    texte: CONSEQUENCES.fusion,
  });
  const radios = [compte.radio, local.radio, fusion.radio];
  const groupe = el(
    "div",
    { class: "choix-synchro", role: "radiogroup", "aria-label": "Sites à garder" },
    compte.noeud,
    local.noeud,
    fusion.noeud,
  );
  groupe.addEventListener("change", () => {
    const choisi = radios.find((r) => r.checked)?.value ?? "fusion";
    consequence.textContent = CONSEQUENCES[choisi];
  });

  const reponse = demander({
    titre: "Des sites existent déjà sur votre compte",
    message:
      "Choisissez ce que vous gardez. Les sites de cet appareil sont copiés en sécurité avant tout changement.",
    contenu: [groupe, consequence],
    boutons: [
      { libelle: "Annuler", valeur: null },
      { libelle: "Continuer", valeur: true, principal: true },
    ],
  });
  fusion.radio.focus();
  return reponse.then((ok) => (ok ? (radios.find((r) => r.checked)?.value ?? null) : null));
}
