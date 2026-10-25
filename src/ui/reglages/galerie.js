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
import { icone } from "../icones.js";

const FREQUENCES = [
  ["onglet", "À chaque onglet"],
  ["jour", "Chaque jour"],
  ["clic", "Au clic"],
];
const CATEGORIES = [[TOUTES, "Toutes"], ...CATEGORIES_GALERIE.map((c) => [c.id, c.libelle])];
const libelleCategorie = (id) => CATEGORIES.find(([c]) => c === id)?.[1] ?? "Toutes";

/** "Photo : <author> sur Unsplash" (the Unsplash licence does not require it: a courtesy). */
const credit = (photo) => [
  "Photo : ",
  el("a", { href: urlAuteur(photo), target: "_blank", rel: "noopener", texte: photo.auteur }),
  " sur ",
  el("a", { href: urlPagePhoto(photo), target: "_blank", rel: "noopener", texte: "Unsplash" }),
];

/**
 * Gallery of the background settings (V2.13): free Unsplash photos by category, and the
 * random photo (each new tab, each day, or on request). The settings panel only shows the
 * photo chosen, the random options and a button; the photos open in a window next to the
 * panel (V2.13.1), the background staying visible behind to judge each one.
 *
 * The choice is a synced background: `lire()` gives the current one, `choisir(fond)`
 * applies another (veil and blur kept).
 */
export function creerGalerie({ lire, choisir }) {
  const effets = () => {
    const f = lire();
    return ["image", "galerie", "aleatoire"].includes(f.type)
      ? { voile: f.voile, flou: f.flou }
      : { voile: 0.25, flou: 0 };
  };
  /** Photo shown now (each new tab: the one drawn for this tab). */
  const photoActuelle = () => trouverPhoto(photoDuFond(lire(), { onglet: photoGalerieAffichee() }));

  // --- in the panel: the photo chosen and the button --------------------------------------
  const apercuImage = el("img", { alt: "", width: "400", height: "225", hidden: true });
  const apercuCredit = el("p", { class: "reglages-note galerie-credit" });
  const ouvrir = el(
    "button",
    {
      type: "button",
      class: "bouton galerie-ouvrir",
      "aria-haspopup": "dialog",
      onclick: () => fenetre.ouvrir(),
    },
    el("span", { texte: "Parcourir la galerie" }),
    el("span", { class: "galerie-ouvrir-nombre", texte: `${photosDe(TOUTES).length} photos` }),
  );
  const apercu = el(
    "div",
    { class: "galerie-apercu" },
    el("div", { class: "galerie-apercu-image" }, apercuImage),
    apercuCredit,
    ouvrir,
  );

  // --- random photo ------------------------------------------------------------------------
  const interrupteur = el("input", {
    type: "checkbox",
    role: "switch",
    class: "interrupteur-bouton",
    dataset: { reglage: "fondAleatoire" },
    onchange: (e) => (e.currentTarget.checked ? activerAleatoire() : desactiverAleatoire()),
  });
  const portee = el("span", { class: "reglages-note" });
  const categorieAleatoire = el(
    "select",
    {
      class: "galerie-select",
      "aria-label": "Catégorie de l'image aléatoire",
      onchange: (e) => {
        const f = lire();
        if (f.type !== "aleatoire") return;
        const categorie = e.currentTarget.value;
        // The draw now happens in this category.
        choisir({
          ...f,
          categorie,
          ...(f.frequence === "clic" ? { choix: photoAuHasard(categorie) } : {}),
        });
      },
    },
    CATEGORIES.map(([id, libelle]) => el("option", { value: id, texte: libelle })),
  );
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
          const f = lire();
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
      const f = lire();
      if (f.type === "aleatoire")
        choisir({ ...f, choix: photoAuHasard(f.categorie, Math.random, photoGalerieAffichee()) });
    },
  });
  const optionsAleatoire = el(
    "div",
    { class: "galerie-options" },
    el("label", { class: "galerie-ligne" }, el("span", { texte: "Catégorie" }), categorieAleatoire),
    frequences,
    autre,
  );
  const carteAleatoire = el(
    "div",
    { class: "galerie-aleatoire" },
    el(
      "label",
      { class: "interrupteur" },
      el("span", { class: "interrupteur-texte" }, el("span", { texte: "Image aléatoire" }), portee),
      interrupteur,
    ),
    optionsAleatoire,
  );

  function activerAleatoire() {
    choisir({ type: "aleatoire", categorie: fenetre.categorie(), frequence: "jour", ...effets() });
  }
  function desactiverAleatoire() {
    // The photo shown stays, as a chosen one.
    const id = photoGalerieAffichee() ?? photosDe(TOUTES)[0]?.id;
    if (id) choisir({ type: "galerie", id, ...effets() });
  }

  const fenetre = creerFenetreGalerie({
    estChoisie: (id) => lire().type === "galerie" && lire().id === id,
    choisir: (id) => choisir({ type: "galerie", id, ...effets() }),
  });

  function maj() {
    const f = lire();
    const aleatoire = f.type === "aleatoire";
    interrupteur.checked = aleatoire;
    optionsAleatoire.hidden = !aleatoire;
    if (aleatoire) categorieAleatoire.value = f.categorie;
    const ou =
      aleatoire && f.categorie !== TOUTES
        ? `dans « ${libelleCategorie(f.categorie)} »`
        : "dans toutes les catégories";
    portee.textContent = aleatoire
      ? `Une photo ${ou}, ${{ onglet: "à chaque nouvel onglet", jour: "chaque jour", clic: "quand vous le demandez" }[f.frequence]}.`
      : "Laissez NedoTab choisir une photo pour vous.";
    for (const b of frequences.children)
      b.setAttribute("aria-checked", String(aleatoire && b.dataset.valeur === f.frequence));
    autre.hidden = !(aleatoire && f.frequence === "clic");
    const photo = f.type === "galerie" || aleatoire ? photoActuelle() : null;
    apercuImage.hidden = !photo;
    if (photo && apercuImage.dataset.photo !== photo.id) {
      apercuImage.src = urlVignette(photo.id);
      apercuImage.dataset.photo = photo.id;
    }
    apercuCredit.replaceChildren(...(photo ? credit(photo) : []));
    fenetre.maj();
  }

  maj();
  const racine = el("div", { class: "galerie" }, apercu, carteAleatoire);
  return { racine, maj, ouvrir: () => fenetre.ouvrir(), arreter: () => fenetre.detruire() };
}

/**
 * The photos, in a window of their own next to the settings panel: categories, then a grid
 * of pictures loaded as they come into view. A click applies the photo at once and keeps
 * the window open; Escape, the close button or a click outside closes it.
 */
function creerFenetreGalerie({ estChoisie, choisir }) {
  let categorie = TOUTES;
  const puces = el("div", {
    class: "galerie-categories",
    role: "radiogroup",
    "aria-label": "Catégories de photos",
  });
  for (const [id, libelle] of CATEGORIES) {
    puces.append(
      el("button", {
        type: "button",
        class: "galerie-categorie",
        role: "radio",
        dataset: { categorie: id },
        texte: libelle,
        onclick: () => {
          categorie = id;
          rendreGrille();
          grille.scrollTop = 0;
          corps.scrollTop = 0;
        },
      }),
    );
  }
  const compte = el("span", { class: "galerie-fenetre-compte" });
  const grille = el("ul", { class: "galerie-grille", "aria-label": "Photos" });
  const rendreGrille = () => {
    const photos = photosDe(categorie);
    compte.textContent = `${photos.length} photos`;
    for (const b of puces.children)
      b.setAttribute("aria-checked", String(b.dataset.categorie === categorie));
    grille.replaceChildren(
      ...photos.map((p) =>
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
              "aria-pressed": String(estChoisie(p.id)),
              onclick: () => choisir(p.id),
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
            el("span", { class: "galerie-photo-auteur", texte: p.auteur }),
          ),
        ),
      ),
    );
  };
  const corps = el("div", { class: "galerie-fenetre-corps" }, grille);
  const dialogue = el(
    "dialog",
    { class: "galerie-fenetre", "aria-labelledby": "galerie-fenetre-titre" },
    el(
      "header",
      { class: "galerie-fenetre-entete" },
      el(
        "div",
        {},
        el("h2", { id: "galerie-fenetre-titre", texte: "Galerie" }),
        el("p", { class: "reglages-note" }, compte, " libres de droits, venues d'Unsplash"),
      ),
      el(
        "button",
        {
          type: "button",
          class: "reglages-fermer",
          "aria-label": "Fermer la galerie",
          onclick: () => dialogue.close(),
        },
        icone("fermer"),
      ),
    ),
    puces,
    corps,
  );
  // A click on the backdrop (outside the window) closes it.
  dialogue.addEventListener("click", (e) => {
    if (e.target === dialogue) dialogue.close();
  });

  return {
    categorie: () => categorie,
    ouvrir() {
      if (!dialogue.isConnected) document.body.append(dialogue);
      rendreGrille();
      dialogue.showModal();
      puces.querySelector("[aria-checked='true']")?.focus();
    },
    /** The photo chosen is marked (also after a change made on another device). */
    maj() {
      for (const b of grille.querySelectorAll(".galerie-photo"))
        b.setAttribute("aria-pressed", String(estChoisie(b.dataset.photo)));
    },
    detruire: () => dialogue.remove(),
  };
}
