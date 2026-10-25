import {
  CATEGORIES_GALERIE,
  photoAuHasard,
  photoDuFond,
  photosDe,
  TOUTES,
  trouverPhoto,
  urlAuteur,
  urlPagePhoto,
  urlVignette,
} from "../../core/galerie.js";
import { el } from "../dom.js";
import { photoGalerieAffichee } from "../apparence.js";

const FREQUENCES = [
  ["onglet", "À chaque onglet"],
  ["jour", "Chaque jour"],
  ["clic", "Au clic"],
];

/**
 * Gallery of the background settings (V2.13): free Unsplash photos by category, and the
 * random photo (each new tab, each day, or on request). The choice is a synced background:
 * `lire()` gives the current one, `choisir(fond)` applies another (veil and blur kept).
 */
export function creerGalerie({ lire, choisir }) {
  const fondActuel = () => lire();
  const effets = () => {
    const f = fondActuel();
    return ["image", "galerie", "aleatoire"].includes(f.type)
      ? { voile: f.voile, flou: f.flou }
      : { voile: 0.25, flou: 0 };
  };
  let categorie = fondActuel().type === "aleatoire" ? fondActuel().categorie : TOUTES;

  // --- categories --------------------------------------------------------------------------
  const puces = el("div", {
    class: "galerie-categories",
    role: "radiogroup",
    "aria-label": "Catégories de photos",
  });
  for (const [id, libelle] of [
    [TOUTES, "Toutes"],
    ...CATEGORIES_GALERIE.map((c) => [c.id, c.libelle]),
  ]) {
    puces.append(
      el("button", {
        type: "button",
        class: "galerie-categorie",
        role: "radio",
        dataset: { categorie: id },
        texte: libelle,
        onclick: () => choisirCategorie(id),
      }),
    );
  }

  // --- random photo ------------------------------------------------------------------------
  const interrupteur = el("input", {
    type: "checkbox",
    role: "switch",
    class: "interrupteur-bouton",
    dataset: { reglage: "fondAleatoire" },
    onchange: (e) => (e.currentTarget.checked ? activerAleatoire() : desactiverAleatoire()),
  });
  const portee = el("span", { class: "reglages-note" });
  const frequences = el(
    "div",
    { class: "segments galerie-frequences", role: "radiogroup", "aria-label": "Fréquence" },
    FREQUENCES.map(([v, texte]) =>
      el("button", {
        type: "button",
        class: "segment",
        role: "radio",
        dataset: { valeur: v },
        texte,
        onclick: () => {
          const f = fondActuel();
          if (f.type !== "aleatoire") return;
          choisir({
            ...f,
            frequence: v,
            ...(v === "clic"
              ? { choix: photoGalerieAffichee() ?? photoAuHasard(f.categorie) }
              : {}),
          });
        },
      }),
    ),
  );
  const autre = el("button", {
    type: "button",
    class: "bouton galerie-autre",
    texte: "Une autre image",
    onclick: () => {
      const f = fondActuel();
      if (f.type === "aleatoire")
        choisir({ ...f, choix: photoAuHasard(f.categorie, Math.random, photoGalerieAffichee()) });
    },
  });
  const carteAleatoire = el(
    "div",
    { class: "galerie-aleatoire" },
    el(
      "label",
      { class: "interrupteur" },
      el("span", { class: "interrupteur-texte" }, el("span", { texte: "Image aléatoire" }), portee),
      interrupteur,
    ),
    frequences,
    autre,
  );

  function activerAleatoire() {
    choisir({ type: "aleatoire", categorie, frequence: "jour", ...effets() });
  }
  function desactiverAleatoire() {
    // The photo shown stays, as a chosen one.
    const id = photoGalerieAffichee() ?? photosDe(categorie)[0]?.id;
    if (id) choisir({ type: "galerie", id, ...effets() });
  }
  function choisirCategorie(id) {
    categorie = id;
    const f = fondActuel();
    // Random: the draw now happens in this category.
    if (f.type === "aleatoire") {
      choisir({
        ...f,
        categorie: id,
        ...(f.frequence === "clic" ? { choix: photoAuHasard(id) } : {}),
      });
    }
    rendreGrille();
    maj();
  }

  // --- photos ------------------------------------------------------------------------------
  const grille = el("ul", { class: "galerie-grille", "aria-label": "Photos" });
  const rendreGrille = () => {
    grille.replaceChildren(
      ...photosDe(categorie).map((p) =>
        el(
          "li",
          {},
          el(
            "button",
            {
              type: "button",
              class: "galerie-photo",
              dataset: { photo: p.id },
              "aria-label": `Photo de ${p.auteur}`,
              title: p.auteur,
              onclick: () => choisir({ type: "galerie", id: p.id, ...effets() }),
            },
            el("img", {
              src: urlVignette(p.id),
              alt: "",
              loading: "lazy",
              decoding: "async",
              referrerpolicy: "no-referrer",
              width: "400",
              height: "225",
            }),
          ),
        ),
      ),
    );
  };

  const credit = el("p", { class: "reglages-note galerie-credit" });

  function maj() {
    const f = fondActuel();
    const aleatoire = f.type === "aleatoire";
    if (aleatoire && f.categorie !== categorie) {
      categorie = f.categorie;
      rendreGrille();
    }
    for (const b of puces.children)
      b.setAttribute("aria-checked", String(b.dataset.categorie === categorie));
    interrupteur.checked = aleatoire;
    const libelle =
      categorie === TOUTES
        ? "dans toutes les catégories"
        : `dans « ${CATEGORIES_GALERIE.find((c) => c.id === categorie)?.libelle} »`;
    portee.textContent = aleatoire
      ? `Une photo ${libelle}, ${{ onglet: "à chaque nouvel onglet", jour: "chaque jour", clic: "quand vous le demandez" }[f.frequence]}.`
      : `Une photo au hasard ${libelle}.`;
    frequences.hidden = !aleatoire;
    for (const b of frequences.children)
      b.setAttribute("aria-checked", String(aleatoire && b.dataset.valeur === f.frequence));
    autre.hidden = !(aleatoire && f.frequence === "clic");
    const choisie = f.type === "galerie" ? f.id : null;
    for (const b of grille.querySelectorAll(".galerie-photo"))
      b.setAttribute("aria-pressed", String(b.dataset.photo === choisie));
    // Credit of the photo shown (the Unsplash licence does not require it: a courtesy).
    // The photo of the choice just made (each new tab: the one drawn for this tab).
    const photo = trouverPhoto(photoDuFond(f, { onglet: photoGalerieAffichee() }));
    if (photo && (f.type === "galerie" || aleatoire)) {
      credit.replaceChildren(
        "Photo : ",
        el("a", { href: urlAuteur(photo), target: "_blank", rel: "noopener", texte: photo.auteur }),
        " sur ",
        el("a", {
          href: urlPagePhoto(photo),
          target: "_blank",
          rel: "noopener",
          texte: "Unsplash",
        }),
      );
    } else credit.replaceChildren();
  }

  rendreGrille();
  maj();

  const racine = el("div", { class: "galerie" }, carteAleatoire, puces, grille, credit);
  return { racine, maj };
}
