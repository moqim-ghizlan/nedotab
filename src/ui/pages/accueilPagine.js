import { borner, decouper, indexApresDepot } from "../../core/pages.js";
import { el } from "../dom.js";
import { rendreGrille } from "../grille.js";
import { creerIndicateur } from "./indicateur.js";
import { creerMesure } from "./mesure.js";
import { brancherMolette } from "./molette.js";
import { creerZonesBord } from "./zonesBord.js";

const REDUIT = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
const CHAMPS = "input, textarea, select, [contenteditable]";

/**
 * Home grid in pages (V2.11): the single ordered list is cut into pages that fit the screen
 * without scrolling, laid side by side on a track that slides. Pages are a view: nothing
 * about them is stored, and a new tab always starts on page 1.
 *
 * Given to creerVueGrille as `pagination`: it renders the pages with the shared tile
 * renderer, tells the drag which lists exist and turns a drop into an index of the whole
 * list, and brings the page of a tile into view before it gets the focus.
 *
 * @param {{ annoncer: (texte: string) => void, redessiner: () => void, actif: () => boolean }} options
 *   redessiner: render again (deferred during a drag) when the room changes;
 *   actif: false while the home grid is not shown (empty grid).
 */
export function creerAccueilPagine({ annoncer, redessiner, actif = () => true }) {
  const piste = el("div", { class: "piste" });
  const temporaire = el("ul", {
    class: "grille page-grille page-grille--temporaire",
    "aria-label": "Nouvelle page",
  });
  temporaire.append(
    el("li", { class: "page-temporaire-texte", texte: "Déposez ici pour placer à la fin" }),
  );
  const fenetre = el(
    "div",
    { class: "accueil-pages", "aria-roledescription": "carrousel", "aria-label": "Mes sites" },
    piste,
  );

  let pages = []; // <ul> of each page, in order
  let pageCourante = 0;
  let cap = { colonnes: 1, lignes: 1, parPage: 4 };
  let glisserEn = null; // { pageDepart } during a drag
  let posee = null; // id of the tile just dropped, shown by the next render

  const nbPages = () => pages.length;
  const derniere = () => (glisserEn ? nbPages() : nbPages() - 1);
  const pageDe = (noeud) => {
    const ul = noeud?.closest?.(".page-grille");
    if (ul === temporaire) return nbPages();
    return pages.indexOf(ul);
  };

  const indicateur = creerIndicateur({ allerA: (p) => allerA(p) });

  const appliquer = (animer) => {
    piste.classList.toggle("piste--sans-transition", !animer || !!REDUIT?.matches);
    piste.style.transform = `translateX(${-pageCourante * 100}%)`;
    pages.forEach((ul, i) => {
      // Pages out of view cannot get the focus nor be read, except during a drag.
      ul.inert = !glisserEn && i !== pageCourante;
    });
    temporaire.inert = !glisserEn;
    indicateur.maj(pageCourante, nbPages(), { temporaire: !!glisserEn });
  };

  /** Short bounce at the first or the last page (nothing further). */
  const rebondir = (sens) => {
    if (REDUIT?.matches) return;
    const base = -pageCourante * 100;
    piste.animate(
      [
        { transform: `translateX(${base}%)` },
        { transform: `translateX(calc(${base}% - ${sens * 12}px))` },
        { transform: `translateX(${base}%)` },
      ],
      { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  };

  function allerA(page, { animer = true, annonce = true } = {}) {
    const cible = Math.min(Math.max(0, page), derniere());
    if (cible === pageCourante) return;
    const focusDansLaGrille = fenetre.contains(document.activeElement);
    pageCourante = cible;
    appliquer(animer);
    if (annonce) {
      annoncer(cible >= nbPages() ? "Nouvelle page" : `Page ${cible + 1} sur ${nbPages()}`);
    }
    // The focus never stays on a tile out of view.
    if (focusDansLaGrille && !glisserEn) pages[cible]?.querySelector(".tuile")?.focus();
    zones.majDisponibles();
  }

  /**
   * After a drop, the page where the tile really is comes into view and the tile lights up.
   * Pages are cut from one list: a tile dropped on a page that has no room before it (the
   * page that only holds "+", or the empty page) goes to the end of the list, which may be
   * on the previous page. The user must see where it went.
   */
  const montrerPosee = () => {
    const tuile = piste.querySelector(`.tuile[data-id="${CSS.escape(posee)}"]`);
    posee = null;
    if (!tuile) return; // put into a folder
    const page = pageDe(tuile);
    if (page !== pageCourante) {
      pageCourante = page;
      appliquer(true);
    }
    tuile.classList.remove("tuile--posee");
    void tuile.offsetWidth;
    tuile.classList.add("tuile--posee");
    tuile.addEventListener("animationend", () => tuile.classList.remove("tuile--posee"), {
      once: true,
    });
  };

  const allerRelatif = (sens) => {
    const avant = pageCourante;
    allerA(pageCourante + sens);
    if (pageCourante === avant) rebondir(sens);
  };

  const zones = creerZonesBord(fenetre, {
    peutAller: (sens) => (sens < 0 ? pageCourante > 0 : pageCourante < derniere()),
    aller: (sens) => allerA(pageCourante + sens),
    pageDuPoint: (x, y) => indicateur.pageSous(x, y),
    allerA: (p) => allerA(p),
  });

  const mesure = creerMesure(fenetre, {
    surChangement: () => {
      const avant = cap.parPage;
      const apres = mesure.mesurer().parPage;
      if (apres === avant) return;
      // Keep in view the first element the user was looking at.
      const premier = pageCourante * avant;
      pageCourante = Math.floor(premier / apres);
      redessiner();
    },
  });

  const suivrePointeur = (e) => zones.suivre(e.clientX, e.clientY);

  // Page Up / Page Down, Ctrl + Home / End (not while typing, not over a window).
  const surTouche = (e) => {
    if (!actif() || e.altKey || e.metaKey) return;
    if (e.target.closest?.(`${CHAMPS}, dialog, .reglages`)) return;
    if (document.querySelector("dialog[open]:modal")) return;
    const aller = {
      PageDown: () => allerRelatif(1),
      PageUp: () => allerRelatif(-1),
      Home: e.ctrlKey ? () => allerA(0) : null,
      End: e.ctrlKey ? () => allerA(nbPages() - 1) : null,
    }[e.key];
    if (!aller || (e.ctrlKey && !["Home", "End"].includes(e.key))) return;
    e.preventDefault();
    aller();
  };
  document.addEventListener("keydown", surTouche);

  const arreterMolette = brancherMolette({
    actif: () => actif() && !glisserEn,
    allerRelatif,
    hauteurPage: () => fenetre.clientHeight,
  });

  return {
    racine: fenetre,
    indicateur: indicateur.racine,

    /** Cuts `liste` into pages and renders them; the page shown is kept (bounded). */
    rendre(liste, { avecAjout, libelleAjout }) {
      cap = mesure.mesurer();
      const decoupees = decouper(liste, cap.parPage, { avecTuileAjout: avecAjout });
      while (pages.length < decoupees.length) {
        const ul = el("ul", { class: "grille page-grille" });
        pages.push(ul);
      }
      for (const ul of pages.splice(decoupees.length)) ul.remove();
      decoupees.forEach((page, i) => {
        const ul = pages[i];
        ul.setAttribute("aria-label", `Page ${i + 1} sur ${decoupees.length}`);
        rendreGrille(ul, page.elements, { avecAjout: page.ajout, libelleAjout });
      });
      piste.replaceChildren(...pages, temporaire);
      fenetre.style.setProperty("--page-colonnes", String(cap.colonnes));
      fenetre.style.setProperty("--page-lignes", String(cap.lignes));
      pageCourante = borner(pageCourante, nbPages());
      appliquer(false);
      if (posee) montrerPosee();
    },

    listes: () => [...pages, temporaire],
    colonnes: () => cap.colonnes,

    /** ELEMENT_DEPLACER's index for a drop, or null when nothing moved. */
    versIndex(evt) {
      const pageSource = pageDe(evt.from);
      const pageCible = pageDe(evt.to);
      if (pageSource === pageCible && evt.oldDraggableIndex === evt.newDraggableIndex) return null;
      return indexApresDepot({
        pageSource,
        pageCible,
        indexDansPage: evt.newDraggableIndex,
        parPage: cap.parPage,
      });
    },

    montrer(noeud) {
      const page = pageDe(noeud);
      if (page >= 0 && page !== pageCourante) allerA(page);
    },

    dansZoneBord: (x, y) => zones.dansZone(x, y),

    debutGlisser() {
      glisserEn = { pageDepart: pageCourante };
      fenetre.classList.add("accueil-pages--glisser");
      appliquer(true);
      zones.debut();
      document.addEventListener("pointermove", suivrePointeur, true);
    },
    finGlisser({ annule, id }) {
      const depart = glisserEn?.pageDepart ?? pageCourante;
      posee = annule ? null : id;
      glisserEn = null;
      fenetre.classList.remove("accueil-pages--glisser");
      zones.fin();
      document.removeEventListener("pointermove", suivrePointeur, true);
      // Escape: back to the page the drag started from.
      if (annule) pageCourante = depart;
      // The render that follows the drop bounds the page and puts the tiles in place.
      appliquer(true);
    },

    pageCourante: () => pageCourante,
    allerA,

    detruire() {
      mesure.detruire();
      zones.fin();
      arreterMolette();
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("pointermove", suivrePointeur, true);
    },
  };
}
