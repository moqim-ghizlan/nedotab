import {
  FILTRES,
  categorieDe,
  compterFiltres,
  filtrerItems,
  grouperParDate,
  selectionValide,
} from "../core/galeriePartage.js";
import {
  ICONES_FAMILLE,
  familleDe,
  formaterTaille,
  nomAffiche,
} from "../core/espacePartageFichiers.js";
import { apercu, titreDe, urlSure } from "../core/espacePartage.js";
import {
  formaterTempsRestant,
  libelleExpiration,
  tempsRestantMs,
} from "../core/expirationPartage.js";
import { domaine } from "../core/url.js";
import { demander } from "./dialogues/commun.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";
import { ouvrirMenu } from "./menuContextuel.js";

const PAS_AFFICHAGE = 60;
const APPUI_LONG_MS = 450;

/** What an item is called in the gallery: its title, else its file name or the start of its text. */
export function titreAffiche(item) {
  if (item.verrouille) return "Contenu chiffré";
  if (item.titre && item.titre !== titreDe(item.type, item.contenu) && item.titre !== item.contenu)
    return item.titre;
  if (item.type === "fichier") return nomAffiche(item.contenu);
  if (item.type === "lien") return domaine(urlSure(item.contenu) ?? item.contenu);
  return apercu(item.contenu, 60);
}

/**
 * Full-screen gallery of the sharing space (T6). Two views in one modal: a library grouped by
 * date (filters, search, multiple selection) and a viewer (preview on the left, details and
 * the "⋯" menu on the right). Everything shown goes through textContent. The data and the
 * actions come from the sharing panel (`api`), so the rules stay in one place.
 *
 * @param {{ vues: () => object[], abonner: (f: () => void) => () => void,
 *   urlApercu: (item: object) => Promise<string|null>, deverrouiller: () => void,
 *   actions: (item: object) => object[], lot: { supprimer: Function, prolonger: Function,
 *   telecharger: Function }, ecart: () => number, appareil: (a: string) => string }} api
 */
export function creerGalerie(api) {
  let racine = null;
  let desabonner = () => {};
  let filtre = "tout";
  let recherche = "";
  let selection = new Set();
  let courant = null; // id of the item shown in the viewer, null in the library
  let limite = PAS_AFFICHAGE;
  let retourFocus = null;
  const observeur = { vignettes: null, suite: null };

  const champ = el("input", {
    type: "search",
    class: "pgal-recherche",
    placeholder: "Rechercher",
    "aria-label": "Rechercher dans l'espace de partage",
    autocomplete: "off",
  });
  const compte = el("span", { class: "pgal-compte" });
  const retour = el(
    "button",
    {
      type: "button",
      class: "pgal-bouton pgal-retour",
      "aria-label": "Retour à la galerie",
      title: "Retour à la galerie",
      hidden: true,
      onclick: () => aller(null),
    },
    icone("retour", { taille: 20 }),
  );
  const fermerBouton = el(
    "button",
    {
      type: "button",
      class: "pgal-bouton",
      "aria-label": "Fermer la galerie",
      title: "Fermer (Échap)",
      onclick: () => fermer(),
    },
    icone("fermer", { taille: 20 }),
  );
  const puces = el("div", {
    class: "pgal-filtres",
    role: "radiogroup",
    "aria-label": "Filtrer",
  });
  const barreSelection = el("div", { class: "pgal-selection", hidden: true, role: "toolbar" });
  const vueGrille = el("div", { class: "pgal-grille-vue" });
  const vueVisionneuse = el("div", { class: "pgal-visionneuse", hidden: true });

  champ.addEventListener("input", () => {
    recherche = champ.value;
    limite = PAS_AFFICHAGE;
    dessiner();
  });

  // --- data --------------------------------------------------------------------------------
  const tous = () => api.vues();
  const visibles = () => filtrerItems(tous(), { filtre, recherche });
  const parId = (id) => tous().find((i) => i.id === id) ?? null;

  // --- navigation --------------------------------------------------------------------------
  function aller(id) {
    courant = id;
    dessiner();
    if (id === null) {
      (vueGrille.querySelector(".pgal-tuile") ?? champ).focus?.();
    } else {
      vueVisionneuse.querySelector(".pgal-apercu")?.focus();
    }
  }
  function voisin(sens) {
    const liste = visibles();
    const i = liste.findIndex((x) => x.id === courant);
    if (i < 0 || liste.length < 2) return;
    aller(liste[(i + sens + liste.length) % liste.length].id);
  }

  // --- selection ---------------------------------------------------------------------------
  const basculerSelection = (ids, oui) => {
    const suite = new Set(selection);
    for (const id of ids) {
      if (oui === undefined ? suite.has(id) : !oui) suite.delete(id);
      else suite.add(id);
    }
    selection = suite;
    dessiner();
  };
  const itemsSelection = () => tous().filter((i) => selection.has(i.id));
  async function confirmerSuppression(liste) {
    const n = liste.length;
    const ok = await demander({
      titre: n > 1 ? `Supprimer ${n} éléments ?` : "Supprimer cet élément ?",
      message: "Cette action est définitive.",
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Supprimer", valeur: true, principal: true, danger: true },
      ],
    });
    return ok === true;
  }
  function dessinerSelection() {
    selection = selectionValide(selection, tous());
    barreSelection.hidden = selection.size === 0;
    if (!selection.size) return barreSelection.replaceChildren();
    const lot = itemsSelection();
    const fichiers = lot.filter((i) => i.type === "fichier" && !i.verrouille);
    barreSelection.replaceChildren(
      el("strong", { texte: `${selection.size} sélectionné${selection.size > 1 ? "s" : ""}` }),
      el("button", {
        type: "button",
        class: "bouton",
        texte: "Télécharger",
        disabled: fichiers.length === 0 || null,
        title: fichiers.length ? null : "Aucun fichier dans la sélection",
        onclick: () => api.lot.telecharger(fichiers),
      }),
      el("button", {
        type: "button",
        class: "bouton",
        texte: "Prolonger",
        onclick: async () => {
          await api.lot.prolonger(lot);
        },
      }),
      el("button", {
        type: "button",
        class: "bouton bouton--danger",
        texte: "Supprimer",
        onclick: async () => {
          if (await confirmerSuppression(lot)) {
            await api.lot.supprimer(lot);
            selection = new Set();
            dessiner();
          }
        },
      }),
      el("button", {
        type: "button",
        class: "lien-discret",
        texte: "Annuler la sélection",
        onclick: () => {
          selection = new Set();
          dessiner();
        },
      }),
    );
  }

  // --- library -----------------------------------------------------------------------------
  function vignette(item) {
    const cadre = el("span", { class: "pgal-vignette" });
    if (item.verrouille) cadre.append(icone("cadenas", { taille: 28 }));
    else if (categorieDe(item) === "images") {
      cadre.append(icone("image", { taille: 28 }));
      cadre.dataset.id = item.id;
      observeur.vignettes?.observe(cadre);
    } else if (item.type === "fichier")
      cadre.append(
        el("span", {
          class: "pgal-emoji",
          texte: ICONES_FAMILLE[familleDe(item.contenu, item.typeMime)] ?? "📎",
        }),
      );
    else if (item.type === "lien") cadre.append(icone("lien", { taille: 28 }));
    else cadre.append(el("span", { class: "pgal-extrait", texte: apercu(item.contenu, 90) }));
    return cadre;
  }
  function tuile(item) {
    let minuteur = null;
    const coche = el("input", {
      type: "checkbox",
      class: "pgal-coche",
      "aria-label": `Sélectionner ${titreAffiche(item)}`,
      checked: selection.has(item.id) || null,
      onclick: (e) => {
        e.stopPropagation();
        basculerSelection([item.id], e.currentTarget.checked);
      },
    });
    const bouton = el(
      "button",
      {
        type: "button",
        class: `pgal-tuile${selection.has(item.id) ? " pgal-tuile--choisie" : ""}`,
        dataset: { id: item.id },
        "aria-label": titreAffiche(item),
        onclick: () => {
          if (selection.size) basculerSelection([item.id]);
          else aller(item.id);
        },
      },
      vignette(item),
      el(
        "span",
        { class: "pgal-legende" },
        item.epingle ? icone("epingle", { taille: 12 }) : null,
        item.chiffre && !item.verrouille ? icone("cadenas", { taille: 12 }) : null,
        el("span", { class: "pgal-legende-texte", texte: titreAffiche(item) }),
      ),
    );
    // Long press (finger) starts a selection.
    bouton.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      minuteur = setTimeout(() => {
        minuteur = null;
        bouton.dataset.appuiLong = "1";
        basculerSelection([item.id], true);
      }, APPUI_LONG_MS);
    });
    for (const t of ["pointerup", "pointerleave", "pointercancel", "pointermove"])
      bouton.addEventListener(t, () => clearTimeout(minuteur));
    bouton.addEventListener(
      "click",
      (e) => {
        if (bouton.dataset.appuiLong) {
          e.stopImmediatePropagation();
          delete bouton.dataset.appuiLong;
        }
      },
      true,
    );
    return el("li", { class: "pgal-case" }, bouton, coche);
  }
  function dessinerGrille() {
    observeur.vignettes?.disconnect();
    observeur.suite?.disconnect();
    const liste = visibles();
    if (!liste.length) {
      vueGrille.replaceChildren(
        el(
          "p",
          { class: "pgal-vide" },
          recherche || filtre !== "tout" ? "Aucun élément ne correspond." : "Aucun élément.",
        ),
      );
      return;
    }
    let restant = limite;
    const sections = [];
    for (const g of grouperParDate(liste)) {
      if (restant <= 0) break;
      const items = g.items.slice(0, restant);
      restant -= items.length;
      const tousChoisis = g.items.every((i) => selection.has(i.id));
      sections.push(
        el(
          "section",
          { class: "pgal-groupe" },
          el(
            "div",
            { class: "pgal-groupe-entete" },
            el("input", {
              type: "checkbox",
              class: "pgal-coche pgal-coche--groupe",
              "aria-label": `Sélectionner ${g.libelle}`,
              checked: tousChoisis || null,
              onclick: (e) =>
                basculerSelection(
                  g.items.map((i) => i.id),
                  e.currentTarget.checked,
                ),
            }),
            el("h3", { texte: g.libelle }),
            el("span", { class: "pgal-groupe-nb", texte: String(g.items.length) }),
          ),
          el("ul", { class: "pgal-tuiles" }, items.map(tuile)),
        ),
      );
    }
    vueGrille.replaceChildren(...sections);
    if (liste.length > limite) {
      const sentinelle = el("div", { class: "pgal-suite", "aria-hidden": "true" });
      vueGrille.append(sentinelle);
      observeur.suite = new IntersectionObserver(
        (e) => {
          if (!e.some((x) => x.isIntersecting)) return;
          limite += PAS_AFFICHAGE;
          dessiner();
        },
        { root: vueGrille, rootMargin: "400px" },
      );
      observeur.suite.observe(sentinelle);
    }
  }

  // --- viewer ------------------------------------------------------------------------------
  function apercuContenu(item) {
    const zone = el("div", { class: "pgal-apercu", tabindex: "0" });
    const grand = (contenu, titre, sous) =>
      el(
        "div",
        { class: "pgal-sans-apercu" },
        contenu,
        el("p", { class: "pgal-sans-apercu-nom", texte: titre }),
        sous ? el("p", { class: "pgal-sans-apercu-sous", texte: sous }) : null,
      );
    if (item.verrouille) {
      zone.append(
        grand(
          icone("cadenas", { taille: 72 }),
          "Contenu chiffré",
          "Déverrouillez le coffre pour le voir.",
        ),
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Déverrouiller",
          onclick: () => api.deverrouiller(),
        }),
      );
    } else if (categorieDe(item) === "images") {
      const img = el("img", {
        class: "pgal-image",
        alt: nomAffiche(item.contenu),
        draggable: "false",
      });
      zone.classList.add("pgal-apercu--image");
      zone.append(img, el("span", { class: "pgal-attente", "aria-hidden": "true" }));
      api
        .urlApercu(item)
        .then((url) => {
          if (courant !== item.id) return;
          if (url) img.src = url;
          zone.querySelector(".pgal-attente")?.remove();
        })
        .catch(() =>
          zone.replaceChildren(
            grand(icone("image", { taille: 72 }), "Image indisponible pour l'instant"),
          ),
        );
      img.addEventListener("click", () => zone.classList.toggle("pgal-apercu--zoom"));
      img.title = "Cliquer pour zoomer";
    } else if (item.type === "texte") {
      zone.append(el("pre", { class: "pgal-texte", texte: item.contenu }));
    } else if (item.type === "lien") {
      const url = urlSure(item.contenu);
      zone.append(
        grand(icone("lien", { taille: 72 }), domaine(url ?? item.contenu), item.contenu),
        url
          ? el("a", {
              class: "bouton bouton--principal",
              href: url,
              target: "_blank",
              rel: "noopener noreferrer",
              texte: "Ouvrir le lien",
            })
          : null,
      );
    } else {
      zone.append(
        grand(
          el("span", {
            class: "pgal-emoji pgal-emoji--grand",
            texte: ICONES_FAMILLE[familleDe(item.contenu, item.typeMime)] ?? "📎",
          }),
          nomAffiche(item.contenu),
          formaterTaille(item.taille),
        ),
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Télécharger",
          onclick: () =>
            api
              .actions(item)
              .find((a) => a.id === "telecharger")
              ?.onChoix(),
        }),
      );
    }
    // Swipe (finger) goes to the next or previous item.
    let x0 = null;
    zone.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    zone.addEventListener(
      "touchend",
      (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 70 && !zone.classList.contains("pgal-apercu--zoom"))
          voisin(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );
    return zone;
  }
  const quand = (ms) =>
    ms == null
      ? "à l'instant"
      : new Date(ms).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  function infos(item) {
    const lignes = [];
    const ligne = (nom, valeur) =>
      valeur && lignes.push(el("dt", { texte: nom }), el("dd", { texte: valeur }));
    if (!item.verrouille) {
      ligne("Titre", item.titre && item.titre !== item.contenu ? item.titre : titreAffiche(item));
      ligne("Description", item.description);
      if (item.type === "fichier") {
        ligne("Fichier", nomAffiche(item.contenu));
        ligne("Taille", formaterTaille(item.taille));
        ligne("Type", item.typeMime || "inconnu");
      } else ligne("Type", item.type === "lien" ? "Lien" : "Texte");
    } else ligne("Élément", "Contenu chiffré");
    ligne("Créé", quand(item.creeLe));
    const exp = libelleExpiration(item, api.ecart());
    if (Number.isFinite(item.expireLe)) {
      const reste = tempsRestantMs(item, api.ecart());
      ligne(
        "Expire",
        exp.texte === "illimité"
          ? "Jamais"
          : `${quand(item.expireLe)} (reste ${formaterTempsRestant(reste)})`,
      );
    }
    ligne("Envoyé depuis", api.appareil(item.appareil));
    ligne("Chiffré", item.chiffre ? "Oui" : "Non");
    return el("dl", { class: "pgal-infos-liste" }, lignes);
  }
  function dessinerVisionneuse() {
    const item = parId(courant);
    const liste = visibles();
    if (!item) return aller(null);
    const i = liste.findIndex((x) => x.id === item.id);
    const plus = el(
      "button",
      {
        type: "button",
        class: "pgal-bouton pgal-plus",
        "aria-label": "Actions",
        "aria-haspopup": "menu",
        title: "Actions",
        onclick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const entrees = api
            .actions(item)
            .map((a) => (a === "-" ? a : { ...a, onChoix: () => lancer(item, a) }));
          ouvrirMenu({
            x: r.right - 200,
            y: r.bottom + 4,
            entrees,
            retourFocus: e.currentTarget,
            libelle: "Actions",
          });
        },
      },
      el("span", { "aria-hidden": "true", texte: "⋯" }),
    );
    vueVisionneuse.replaceChildren(
      el(
        "div",
        { class: "pgal-scene" },
        apercuContenu(item),
        liste.length > 1
          ? el(
              "button",
              {
                type: "button",
                class: "pgal-nav pgal-nav--prec",
                "aria-label": "Précédent",
                onclick: () => voisin(-1),
              },
              icone("retour", { taille: 22 }),
            )
          : null,
        liste.length > 1
          ? el(
              "button",
              {
                type: "button",
                class: "pgal-nav pgal-nav--suiv",
                "aria-label": "Suivant",
                onclick: () => voisin(1),
              },
              icone("chevron", { taille: 22 }),
            )
          : null,
      ),
      el(
        "aside",
        { class: "pgal-infos", "aria-label": "Détails" },
        el(
          "div",
          { class: "pgal-infos-entete" },
          el("span", { class: "pgal-infos-position", texte: `${i + 1} / ${liste.length}` }),
          plus,
        ),
        el("h3", { class: "pgal-infos-titre", texte: titreAffiche(item) }),
        infos(item),
      ),
    );
  }
  async function lancer(item, a) {
    if (a.id === "supprimer") {
      if (!(await confirmerSuppression([item]))) return;
      const liste = visibles();
      const i = liste.findIndex((x) => x.id === item.id);
      await a.onChoix();
      // Stay in the viewer on the neighbour, or go back to the library when it was the last.
      const suivant = liste[i + 1] ?? liste[i - 1];
      aller(suivant && suivant.id !== item.id ? suivant.id : null);
      return;
    }
    await a.onChoix();
  }

  // --- drawing -----------------------------------------------------------------------------
  function dessinerFiltres() {
    const nb = compterFiltres(tous());
    puces.replaceChildren(
      ...FILTRES.map((f) =>
        el(
          "button",
          {
            type: "button",
            role: "radio",
            class: "pgal-puce",
            "aria-checked": String(filtre === f.id),
            onclick: () => {
              filtre = f.id;
              limite = PAS_AFFICHAGE;
              dessiner();
            },
          },
          el("span", { texte: f.libelle }),
          el("span", { class: "pgal-puce-nb", texte: String(nb[f.id]) }),
        ),
      ),
    );
  }
  function dessiner() {
    if (!racine) return;
    const enVisionneuse = courant !== null && parId(courant);
    if (courant !== null && !enVisionneuse) courant = null;
    racine.classList.toggle("pgal--visionneuse", courant !== null);
    retour.hidden = courant === null;
    vueGrille.hidden = courant !== null;
    vueVisionneuse.hidden = courant === null;
    compte.textContent = `${tous().length}`;
    dessinerFiltres();
    if (courant === null) {
      dessinerSelection();
      dessinerGrille();
    } else {
      barreSelection.hidden = true;
      dessinerVisionneuse();
    }
  }

  // --- life cycle --------------------------------------------------------------------------
  function surTouche(e) {
    if (e.key === "Escape") {
      if (document.querySelector("dialog[open]:modal, .menu")) return;
      e.preventDefault();
      e.stopPropagation();
      if (courant !== null) aller(null);
      else if (selection.size) {
        selection = new Set();
        dessiner();
      } else fermer();
    } else if (courant !== null && !e.target.closest?.("input, textarea")) {
      if (e.key === "ArrowRight") voisin(1);
      else if (e.key === "ArrowLeft") voisin(-1);
    }
  }

  function ouvrir(idDepart = null) {
    if (racine) return;
    retourFocus = document.activeElement;
    limite = PAS_AFFICHAGE;
    courant = idDepart && parId(idDepart) ? idDepart : null;
    // Thumbnails are loaded only when they come into view.
    observeur.vignettes = new IntersectionObserver(
      (entrees) => {
        for (const x of entrees) {
          if (!x.isIntersecting) continue;
          observeur.vignettes.unobserve(x.target);
          const item = parId(x.target.dataset.id);
          if (!item) continue;
          api
            .urlApercu(item)
            .then((url) => {
              if (!url || !x.target.isConnected) return;
              const img = el("img", {
                class: "pgal-miniature",
                alt: "",
                src: url,
                draggable: "false",
              });
              img.addEventListener("error", () => img.remove(), { once: true });
              x.target.replaceChildren(img);
            })
            .catch(() => {});
        }
      },
      { root: vueGrille, rootMargin: "200px" },
    );
    racine = el(
      "div",
      {
        class: "pgal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Galerie de l'espace de partage",
      },
      el(
        "header",
        { class: "pgal-entete" },
        retour,
        el("h2", { class: "pgal-titre" }, "Galerie ", compte),
        champ,
        puces,
        fermerBouton,
      ),
      barreSelection,
      el("div", { class: "pgal-corps" }, vueGrille, vueVisionneuse),
    );
    document.body.append(racine);
    document.addEventListener("keydown", surTouche, true);
    desabonner = api.abonner(() => dessiner());
    dessiner();
    (courant !== null
      ? vueVisionneuse.querySelector(".pgal-apercu")
      : (vueGrille.querySelector(".pgal-tuile") ?? champ)
    )?.focus();
  }
  function fermer() {
    if (!racine) return;
    desabonner();
    observeur.vignettes?.disconnect();
    observeur.suite?.disconnect();
    document.removeEventListener("keydown", surTouche, true);
    racine.remove();
    racine = null;
    selection = new Set();
    retourFocus?.focus?.();
  }

  return { ouvrir, fermer, estOuverte: () => !!racine };
}
