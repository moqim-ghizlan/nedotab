/**
 * The pin list of the home page (7.2): up to 10 sites or folders, in a vertical column at the
 * top left (15 % from the top). Icon only; on hover or focus the title unfolds (same effect as
 * the icon row above the search bar) and two buttons appear: unpin and move (drag handle).
 * Hidden on phones and when the setting is off; the pins are kept either way.
 * Titles are always `textContent`.
 */
import Sortable from "sortablejs";
import { A } from "../core/actions.js";
import { listeEpingles } from "../core/epingles.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { creerIcone, sitesDansNouvelOnglet, urlOuverture } from "./tuile.js";
import { creerIconeDossier } from "./tuileDossier.js";

const REDUIT = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** What changes the look of the list (not the rank: the order is the position in the list). */
const signature = (liste, actif) =>
  JSON.stringify([
    actif,
    liste.map(({ element: e }) => [
      e.id,
      e.type,
      e.titre,
      e.url,
      e.icone,
      e.items?.length,
      e.items?.[0]?.id,
    ]),
  ]);

export function creerEpingles({ store, ouvrirDossier = () => {}, lectureSeule = () => false }) {
  const liste = el("ul", { class: "epingles-liste", "aria-label": "Sites épinglés" });
  const racine = el(
    "nav",
    { class: "epingles", "aria-label": "Éléments épinglés", hidden: "" },
    liste,
  );
  let derniere = "";
  let glisse = false;
  let tri = null;

  const actif = () => !store.lire().reglages.sansEpingles;

  function creerLigne(element) {
    const dossier = element.type === "dossier";
    const contenu = [
      dossier ? creerIconeDossier(element) : creerIcone(element),
      el("span", { class: "epingle-titre", texte: element.titre }),
    ];
    const lien = dossier
      ? el(
          "button",
          {
            type: "button",
            class: "epingle-lien epingle-lien--dossier",
            dataset: { id: element.id },
            title: element.titre,
            "aria-label": `Ouvrir le dossier ${element.titre}`,
          },
          ...contenu,
        )
      : el(
          "a",
          {
            class: "epingle-lien",
            href: urlOuverture(element.url),
            dataset: { id: element.id, url: element.url },
            title: element.titre,
            draggable: "false",
          },
          ...contenu,
        );
    if (!dossier && sitesDansNouvelOnglet()) {
      lien.target = "_blank";
      lien.rel = "noopener";
    }
    if (dossier) lien.addEventListener("click", () => ouvrirDossier(element.id, lien));
    for (const img of lien.querySelectorAll("img")) img.draggable = false;
    lien.addEventListener("dragstart", (e) => e.preventDefault());
    const actions = lectureSeule()
      ? []
      : [
          el(
            "button",
            {
              type: "button",
              class: "epingle-action epingle-desepingler",
              "aria-label": `Désépingler ${element.titre}`,
              title: "Désépingler",
              dataset: { desepingler: element.id },
            },
            icone("fermer", { taille: 14 }),
          ),
          el(
            "button",
            {
              type: "button",
              class: "epingle-action epingle-poignee",
              "aria-label": `Changer la place de ${element.titre} (flèches haut et bas)`,
              title: "Changer de place",
              dataset: { poignee: element.id },
            },
            icone("poignee", { taille: 14 }),
          ),
        ];
    return el(
      "li",
      { class: "epingle", dataset: { id: element.id } },
      lien,
      el("span", { class: "epingle-actions" }, ...actions),
    );
  }

  function rendre(force = false) {
    if (glisse) return;
    const epingles = listeEpingles(store.lire().grille);
    const visible = actif() && epingles.length > 0;
    racine.hidden = !visible;
    const sig = signature(epingles, visible);
    if (!force && sig === derniere) return;
    const premier = derniere === "";
    derniere = sig;
    const focus = document.activeElement?.closest?.(".epingle")?.dataset.id;
    liste.replaceChildren(...epingles.map((x) => creerLigne(x.element)));
    liste.classList.toggle("epingles-liste--entree", premier);
    if (focus)
      liste.querySelector(`.epingle[data-id="${CSS.escape(focus)}"] .epingle-lien`)?.focus();
  }

  const deplacerVers = (id, versIndex, refocaliser) => {
    store.envoyer({ type: A.EPINGLE_DEPLACER, id, versIndex });
    if (refocaliser)
      requestAnimationFrame(() =>
        liste
          .querySelector(`.epingle[data-id="${CSS.escape(id)}"] .epingle-poignee`)
          ?.focus(),
      );
  };

  liste.addEventListener("click", (e) => {
    const bouton = e.target.closest("[data-desepingler]");
    if (!bouton) return;
    bouton.closest(".epingle").classList.add("epingle--sortie");
    const fin = () => store.envoyer({ type: A.DESEPINGLER, id: bouton.dataset.desepingler });
    if (REDUIT()) fin();
    else setTimeout(fin, 160);
  });

  // Keyboard on the handle: ↑ ↓ move the pin.
  liste.addEventListener("keydown", (e) => {
    const poignee = e.target.closest?.("[data-poignee]");
    if (!poignee || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const ids = listeEpingles(store.lire().grille).map((x) => x.element.id);
    const i = ids.indexOf(poignee.dataset.poignee);
    deplacerVers(poignee.dataset.poignee, i + (e.key === "ArrowUp" ? -1 : 1), true);
  });

  // Right click: a small menu.
  liste.addEventListener("contextmenu", (e) => {
    const ligne = e.target.closest(".epingle");
    if (!ligne) return;
    e.preventDefault();
    const id = ligne.dataset.id;
    const r = listeEpingles(store.lire().grille).find((x) => x.element.id === id);
    if (!r) return;
    const lien = ligne.querySelector(".epingle-lien");
    const entrees = [
      {
        libelle: r.element.type === "dossier" ? "Ouvrir" : "Ouvrir le site",
        onChoix: () => lien?.click(),
      },
    ];
    if (!lectureSeule())
      entrees.push({
        libelle: "Désépingler",
        onChoix: () => store.envoyer({ type: A.DESEPINGLER, id }),
      });
    ouvrirMenu({
      x: e.clientX,
      y: e.clientY,
      entrees,
      libelle: r.element.titre,
      retourFocus: lien,
    });
  });

  if (!lectureSeule()) {
    tri = Sortable.create(liste, {
      handle: ".epingle-poignee",
      draggable: ".epingle",
      animation: REDUIT() ? 0 : 180,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      ghostClass: "epingle--fantome",
      chosenClass: "epingle--choisie",
      dragClass: "epingle--glissee",
      forceFallback: true,
      fallbackTolerance: 3,
      onStart: () => {
        glisse = true;
        racine.classList.add("epingles--glisse");
      },
      onEnd: (evt) => {
        glisse = false;
        racine.classList.remove("epingles--glisse");
        if (evt.oldDraggableIndex !== evt.newDraggableIndex)
          store.envoyer({
            type: A.EPINGLE_DEPLACER,
            id: evt.item.dataset.id,
            versIndex: evt.newDraggableIndex,
          });
        rendre(true);
      },
    });
  }

  const desabonner = store.abonner(() => rendre());
  rendre();

  return {
    racine,
    actualiser: () => rendre(true),
    detruire() {
      desabonner();
      tri?.destroy();
      racine.remove();
    },
  };
}
