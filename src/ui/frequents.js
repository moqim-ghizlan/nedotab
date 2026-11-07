/**
 * Row "Les plus utilisés" under the search bar (V4.22): one line of shortcuts to the sites
 * used the most, wherever they are stored. Calm by design: the content is computed ONCE when
 * the page opens (the icons never move under the cursor); only a deleted, renamed, pinned,
 * unpinned or hidden site updates it at once. Never a second line, never a horizontal scroll.
 */
import { A } from "../core/actions.js";
import {
  frequentsDe,
  nombreIcones,
  sitesFrequents,
} from "../core/frequents.js";
import { el } from "./dom.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { ecranTactile, ouvrirMenuTactile } from "./menuTactile.js";
import { toast } from "./toast.js";
import { creerIcone, ouvrirSite, sitesDansNouvelOnglet, urlOuverture } from "./tuile.js";

const CLE_VU = "nedotab:frequentsVus";
export const DEBOUNCE_MS = 150;
const APPUI_LONG_MS = 400;
const SEUIL_MOUVEMENT_PX = 8;
const HAUTEUR_RESERVEE = "72px";
// Home block (TODO 9): the number of pills shown last time. The room is kept from the very first
// frame (grey placeholders), so the search bar never moves when the real icons arrive.
const CLE_ACCUEIL = "nedotab:frequentsAccueil";
const HAUTEUR_ACCUEIL = "48px";
export const DELAI_STABLE_MS = 300;

/** The number shown last time; 0 = known empty; `defaut` when nothing was ever remembered. */
function lireNbAccueil(defaut) {
  try {
    const brut = localStorage.getItem(CLE_ACCUEIL);
    if (brut === null) return defaut;
    const n = Number(brut);
    return Number.isInteger(n) && n >= 0 ? Math.min(n, 12) : defaut;
  } catch {
    return defaut;
  }
}
function ecrireNbAccueil(n) {
  try {
    localStorage.setItem(CLE_ACCUEIL, String(n));
  } catch {
    /* only a comfort */
  }
}

function lireVu() {
  try {
    return localStorage.getItem(CLE_VU) === "1";
  } catch {
    return false;
  }
}
function ecrireVu(vu) {
  try {
    if (vu) localStorage.setItem(CLE_VU, "1");
    else localStorage.removeItem(CLE_VU);
  } catch {
    /* only a comfort: the space is then reserved a little later */
  }
}

/**
 * @param {object} d
 * @param {import("../core/store.js").Store} d.store
 * @param {{ classement: () => object[], abonner: (f: Function) => Function }} d.usage
 * @param {() => boolean} d.suiviActif tracking on (setting "Mémoriser les sites…")
 * @param {(id: string) => void} d.afficherDansGrille
 * @param {(id: string) => void} d.modifierSite
 * @param {() => boolean} [d.lectureSeule]
 */
export function creerFrequents({
  store,
  usage,
  suiviActif,
  afficherDansGrille,
  modifierSite,
  lectureSeule = () => false,
  // T7: the same row can also be the block of the home page (above the search bar):
  // its own on/off setting, its own number of sites, and it follows the visits live.
  accueil = false,
  lireAffichage = (r) => frequentsDe(r).afficher,
  maximum = null,
}) {
  const liste = el("ul", { class: "frequents-liste" });
  const titre = el("p", { class: "frequents-titre", texte: "Les plus utilisés", hidden: true });
  const racine = el(
    "nav",
    {
      class: `frequents${accueil ? " frequents--accueil" : ""}`,
      "aria-label": "Les plus utilisés",
      hidden: true,
    },
    titre,
    liste,
  );
  // Never seen yet: the room of a usual row is kept (the setting is on), it shrinks only if there is nothing to show.
  const nbMemorise = accueil ? lireNbAccueil(0) : 0;
  let stable = null; // the pills only take clicks once the layout has settled
  // (the setting is known locally: switched off, no room is reserved)
  // The search bar must NEVER move: while the setting is on, the room of the row is kept from the
  // first frame, with or without icons (placeholders only when we know how many there will be).
  if (accueil && lireAffichage(store.lire().reglages)) {
    racine.hidden = false;
    racine.classList.add("frequents--reserve", "frequents--chargement");
    racine.style.minHeight = HAUTEUR_ACCUEIL;
    liste.replaceChildren(
      ...Array.from({ length: nbMemorise }, () => el("li", { class: "frequent frequent--squelette", "aria-hidden": "true" })),
    );
  }
  if (!accueil && lireVu()) {
    // Seen last time: the room is kept from the start, no jump when the row appears.
    racine.hidden = false;
    racine.classList.add("frequents--reserve");
    racine.style.minHeight = HAUTEUR_RESERVEE;
  }

  /** Ids shown, fixed for the life of the page (null until the statistics arrived). */
  let ordre = null;
  let signature = "";
  let capacite = 8;

  const reglages = () => store.lire().reglages;

  /** What makes the row recompute at once: pins and hidden sites (not the statistics). */
  const signatureDe = () => {
    const { masques, afficher } = frequentsDe(reglages());
    const epingles = [];
    const visiter = (items) => {
      for (const e of items) {
        if (e.type === "dossier") visiter(e.items);
        else if (e.epingle === true) epingles.push(e.id);
      }
    };
    visiter(store.lire().grille);
    return JSON.stringify([afficher, masques, epingles.sort(), suiviActif(), maximum?.() ?? 8]);
  };

  const calculer = () =>
    sitesFrequents({
      grille: store.lire().grille,
      classement: usage.classement(),
      reglages: reglages(),
      suiviActif: suiviActif(),
      max: maximum?.() ?? 8,
    });

  const trouver = (id) => {
    const visiter = (items, chemin) => {
      for (const e of items) {
        if (e.id === id) return { site: e, chemin };
        if (e.type === "dossier") {
          const r = visiter(e.items, [...chemin, e.titre]);
          if (r) return r;
        }
      }
      return null;
    };
    return visiter(store.lire().grille, []);
  };

  function entrees(id) {
    const r = trouver(id);
    if (!r) return null;
    const { site } = r;
    const modifiable = !lectureSeule();
    const liste = [
      { libelle: "Ouvrir dans un nouvel onglet", onChoix: () => ouvrirSite(site.url, { nouvelOnglet: true, id }) },
      { libelle: "Afficher dans la grille", onChoix: () => afficherDansGrille(id) },
    ];
    if (modifiable) {
      liste.push(
        {
          libelle: site.epingle === true ? "Désépingler de la recherche" : "Épingler dans la recherche",
          onChoix: () =>
            store.envoyer({ type: A.SITE_MODIFIER, id, changements: { epingle: site.epingle !== true } }),
        },
        { libelle: "Masquer de cette rangée", onChoix: () => masquer(id, site.titre) },
        { libelle: "Modifier le site", onChoix: () => modifierSite(id) },
      );
    }
    return { entrees: liste, libelle: site.titre };
  }

  function masquer(id, nom) {
    const avant = frequentsDe(reglages());
    if (avant.masques.includes(id)) return;
    store.envoyer({
      type: A.REGLAGES_MODIFIER,
      changements: { frequents: { ...avant, masques: [...avant.masques, id] } },
    });
    toast(`« ${nom} » masqué de cette rangée`, {
      duree: 8000,
      action: {
        libelle: "Annuler",
        onClic: () => {
          const actuel = frequentsDe(reglages());
          store.envoyer({
            type: A.REGLAGES_MODIFIER,
            changements: { frequents: { ...actuel, masques: actuel.masques.filter((m) => m !== id) } },
          });
        },
      },
    });
  }

  function creerElement({ site, chemin }) {
    const emplacement = chemin.length ? ` — ${["Accueil", ...chemin].join(" › ")}` : "";
    const lien = el(
      "a",
      {
        class: "frequent-lien",
        href: urlOuverture(site.url),
        dataset: { id: site.id, url: site.url },
        title: `${site.titre}${emplacement}`,
        draggable: "false",
      },
      creerIcone(site),
      el("span", { class: "frequent-titre", texte: site.titre }),
      site.epingle === true ? el("span", { class: "frequent-punaise", "aria-hidden": "true", texte: "📌" }) : null,
    );
    if (sitesDansNouvelOnglet()) {
      lien.target = "_blank";
      lien.rel = "noopener";
    }
    for (const img of lien.querySelectorAll("img")) img.draggable = false;
    lien.addEventListener("dragstart", (e) => e.preventDefault());
    return el("li", { class: "frequent" }, lien);
  }

  function rendre() {
    // Home block waiting for its figures: the grey placeholders stay, nothing is hidden or moved.
    if (accueil && ordre === null && racine.classList.contains("frequents--chargement")) return;
    const sites = (ordre ?? [])
      .map((id) => {
        const r = trouver(id);
        return r ? { site: r.site, chemin: r.chemin } : null;
      })
      .filter(Boolean)
      .slice(0, capacite);
    const afficher = lireAffichage(reglages()) && sites.length > 0;
    liste.replaceChildren(...sites.map(creerElement));
    titre.hidden = accueil || !frequentsDe(reglages()).titre;
    // Home block: the room stays reserved whenever the setting is on, even with nothing to show.
    const reserve = accueil && lireAffichage(reglages());
    racine.hidden = reserve ? false : !afficher;
    racine.classList.toggle("frequents--reserve", reserve);
    racine.style.minHeight = reserve ? HAUTEUR_ACCUEIL : "";
    if (ordre !== null && !accueil) ecrireVu(afficher);
    if (accueil && ordre !== null) {
      ecrireNbAccueil(afficher ? sites.length : 0);
      if (racine.classList.contains("frequents--chargement")) {
        // First real render: fade in, and no click for a short moment (a tap meant for the search
        // bar must never land on a pill).
        racine.classList.remove("frequents--chargement");
        racine.classList.add("frequents--arrivee", "frequents--stabilisation");
        clearTimeout(stable);
        stable = setTimeout(() => racine.classList.remove("frequents--arrivee", "frequents--stabilisation"), DELAI_STABLE_MS);
      }
    }
    racine.dispatchEvent(new CustomEvent("frequents:change", { bubbles: true, detail: { afficher } }));
  }

  /** First computation (or immediate update): the order is then frozen. */
  function recalculer() {
    signature = signatureDe();
    ordre = lireAffichage(reglages()) ? calculer().map((r) => r.site.id) : [];
    rendre();
  }

  // Statistics arrive (cache first): the row is computed once, then never moves by itself.
  let initialise = false;
  const premierCalcul = () => {
    if (initialise) return;
    initialise = true;
    recalculer();
  };
  usage.abonner(() => {
    // The home block follows every visit; the row under the search bar stays still.
    if (accueil && initialise) recalculer();
    else premierCalcul();
  });
  if (usage.charge()) premierCalcul();
  // A site of the row deleted, renamed, re-iconed, or a pin / hidden change: immediate update.
  store.abonner(() => {
    if (!initialise) return;
    if (signatureDe() !== signature) recalculer();
    else rendre();
  });

  // --- Width: one line, no wrap, no scroll ---------------------------------------------------
  let minuteur = null;
  const mesurer = () => {
    const largeur = racine.parentElement?.clientWidth ?? racine.clientWidth;
    // Home block: as many as chosen (the row then scrolls sideways when it is too narrow).
    const n = maximum ? maximum() : nombreIcones(largeur) || 8;
    if (n !== capacite) {
      capacite = n;
      rendre();
    }
  };
  const observateur = new ResizeObserver(() => {
    clearTimeout(minuteur);
    minuteur = setTimeout(mesurer, DEBOUNCE_MS);
  });
  queueMicrotask(() => {
    if (racine.parentElement) {
      observateur.observe(racine.parentElement);
      mesurer();
    }
  });

  // --- Menu: right click, keyboard, long press ----------------------------------------------
  const lienDe = (ev) => ev.target.closest?.(".frequent-lien[data-id]");
  const ouvrirPour = (lien, x, y, tactile) => {
    const catalogue = entrees(lien.dataset.id);
    if (!catalogue) return;
    if (tactile && ecranTactile()) ouvrirMenuTactile({ ...catalogue, tuile: lien });
    else ouvrirMenu({ x, y, ...catalogue, retourFocus: lien });
  };
  racine.addEventListener("contextmenu", (ev) => {
    const lien = lienDe(ev);
    if (!lien) return;
    ev.preventDefault();
    ouvrirPour(lien, ev.clientX, ev.clientY, ev.pointerType === "touch");
  });
  let appui = null;
  racine.addEventListener("pointerdown", (ev) => {
    const lien = lienDe(ev);
    if (!lien || ev.pointerType !== "touch") return;
    appui = {
      lien,
      x: ev.clientX,
      y: ev.clientY,
      minuteur: setTimeout(() => {
        appui.ouvert = true;
        ouvrirPour(lien, ev.clientX, ev.clientY, true);
      }, APPUI_LONG_MS),
    };
  });
  racine.addEventListener("pointermove", (ev) => {
    if (appui && Math.hypot(ev.clientX - appui.x, ev.clientY - appui.y) > SEUIL_MOUVEMENT_PX) {
      clearTimeout(appui.minuteur);
    }
  });
  const finAppui = () => {
    if (appui) clearTimeout(appui.minuteur);
    setTimeout(() => (appui = null), 0);
  };
  racine.addEventListener("pointerup", finAppui);
  racine.addEventListener("pointercancel", finAppui);
  // The click that ends a long press must not open the site.
  racine.addEventListener(
    "click",
    (ev) => {
      if (appui?.ouvert) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true,
  );

  // --- Keyboard: ← → move inside the row, Enter opens (native link) --------------------------
  racine.addEventListener("keydown", (ev) => {
    const lien = lienDe(ev);
    if (!lien) return;
    const liens = [...racine.querySelectorAll(".frequent-lien")];
    const i = liens.indexOf(lien);
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      liens[(i + (ev.key === "ArrowRight" ? 1 : -1) + liens.length) % liens.length]?.focus();
    } else if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      liens[ev.key === "Home" ? 0 : liens.length - 1]?.focus();
    } else if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) {
      ev.preventDefault();
      const r = lien.getBoundingClientRect();
      ouvrirPour(lien, r.left + r.width / 2, r.bottom, false);
    }
  });

  return {
    racine,
    /** Focuses the first icon (↓ from the empty search bar). @returns {boolean} done */
    focaliser() {
      const premier = racine.querySelector(".frequent-lien");
      premier?.focus();
      return !!premier;
    },
    visible: () => !racine.hidden && racine.querySelector(".frequent-lien") !== null,
    ids: () => (ordre ?? []).slice(0, capacite),
    detruire: () => {
      observateur.disconnect();
      clearTimeout(minuteur);
    },
  };
}
