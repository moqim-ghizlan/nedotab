import { couleurDepuisTexte, lettrePourSite } from "../core/couleurs.js";
import { urlPourNavigateur } from "../core/navigateurs.js";
import { el } from "./dom.js";
import {
  empreinte,
  globeNavigateur,
  urlFaviconGoogleAdresse,
  urlsFaviconGoogle,
} from "./services/icones.js";

function pastilleLettre(site) {
  return el("span", {
    class: "tuile-icone tuile-icone--lettre",
    style: `background:${(site.icone?.type === "lettre" && site.icone.couleur) || couleurDepuisTexte(site.url)}`,
    "aria-hidden": "true",
    texte: (site.icone?.type === "lettre" && site.icone.texte) || lettrePourSite(site),
  });
}

/**
 * An icon from the browser's favicon cache only exists where the site was visited: on
 * another device or browser (synced grid, Brave…) the cache answers its generic globe.
 * Then Google's favicon service is tried (domain, then parent domains), and the letter
 * badge when it knows none of them.
 */
function verifierCacheNavigateur(img, site, lettre) {
  img.addEventListener(
    "load",
    async () => {
      const globe = await globeNavigateur();
      if (!globe || empreinte(img) !== globe) return;
      // Google's default 16 px icon means an unknown domain: try the parent domain.
      const suivantes = urlsFaviconGoogle(site.url);
      const essayer = () => {
        const src = suivantes.shift();
        if (!src) return lettre();
        img.addEventListener("load", () => img.naturalWidth < 32 && essayer(), { once: true });
        img.src = src;
      };
      essayer();
    },
    { once: true },
  );
}

/**
 * Icons saved before 3.4.1 asked Google by domain ("domain="), which gives the generic G for
 * Gmail, Docs, Drive…: the full address is shown first, the saved icon stays the fallback.
 */
const iconeGoogleParDomaine = (icone) =>
  icone.source === "google" && /\/s2\/favicons\?domain=/.test(icone.valeur);

function revenirSiInconnue(img, ancienne, lettre) {
  const revenir = () => {
    img.removeEventListener("load", verifier);
    img.addEventListener("error", lettre, { once: true });
    img.src = ancienne;
  };
  // Google's default 16 px icon means it knows nothing about this address.
  const verifier = () => {
    img.removeEventListener("error", revenir);
    if (img.naturalWidth < 32) revenir();
    else img.addEventListener("error", lettre, { once: true });
  };
  img.addEventListener("load", verifier, { once: true });
  img.addEventListener("error", revenir, { once: true });
}

/**
 * Builds the icon node of a site. A broken image falls back to the letter badge on screen
 * only (the state is not changed).
 */
export function creerIcone(site) {
  const icone = site.icone;
  if (icone?.type !== "url" && icone?.type !== "image") return pastilleLettre(site);
  const parDomaine = iconeGoogleParDomaine(icone);
  const img = el("img", {
    src: parDomaine ? urlFaviconGoogleAdresse(site.url) : icone.valeur,
    alt: "",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    draggable: "false",
  });
  const cadre = el("span", { class: "tuile-icone tuile-icone--image", "aria-hidden": "true" }, img);
  const lettre = () => cadre.replaceWith(pastilleLettre({ ...site, icone: undefined }));
  if (parDomaine) revenirSiInconnue(img, icone.valeur, lettre);
  else img.addEventListener("error", lettre, { once: true });
  if (icone.source === "chrome") verifierCacheNavigateur(img, site, lettre);
  return cadre;
}

/** Synced setting (V2.10.3): sites open in a new tab. */
let nouvelOnglet = false;

/** Device setting: browser that opens the sites on iOS (Safari by default). */
let navigateur = "safari";

/** Applies the setting to the tiles already shown and to those created afterwards. */
export function ouvrirSitesDansNouvelOnglet(actif) {
  nouvelOnglet = !!actif;
  for (const lien of document.querySelectorAll("a.tuile--site")) cibler(lien);
}

/** Same for the browser chosen on this device. */
export function ouvrirSitesAvec(choix) {
  navigateur = choix ?? "safari";
  for (const lien of document.querySelectorAll("a.tuile--site")) cibler(lien);
}

/** Address that opens a site in the chosen browser. */
export const urlOuverture = (url) => urlPourNavigateur(url, navigateur);

/** Opens a site: another browser is another app, so no new tab is needed there. */
export function ouvrirSite(url, { nouvelOnglet: onglet = false } = {}) {
  if (navigateur !== "safari") location.assign(urlOuverture(url));
  else if (onglet) window.open(url, "_blank", "noopener");
  else location.assign(url);
}

function cibler(lien) {
  lien.href = urlOuverture(lien.dataset.url);
  if (nouvelOnglet && navigateur === "safari") {
    lien.target = "_blank";
    lien.rel = "noopener";
  } else {
    lien.removeAttribute("target");
    lien.removeAttribute("rel");
  }
}

export const sitesDansNouvelOnglet = () => nouvelOnglet;

/** Purely presentational: receives an element, returns a DOM node. */
export function creerTuile(element) {
  const lien = el("a", {
    class: "tuile tuile--site",
    href: element.url,
    dataset: { id: element.id, url: element.url },
    "aria-label": element.titre,
    draggable: "false",
  });
  if (element.ia?.etat === "en_attente") lien.dataset.ia = "en_attente";
  cibler(lien);
  lien.append(
    creerIcone(element),
    el("span", {
      class: "tuile-titre",
      // Tooltip (computer): the title, and the description when there is one (V4.2).
      title: element.description
        ? `${element.titre}
${element.description}`
        : element.titre,
      texte: element.titre,
    }),
  );
  return lien;
}
