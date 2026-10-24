import { couleurDepuisTexte, lettrePourSite } from "../core/couleurs.js";
import { el } from "./dom.js";
import { empreinte, globeNavigateur, urlsFaviconGoogle } from "./services/icones.js";

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
 * Builds the icon node of a site. A broken image falls back to the letter badge on screen
 * only (the state is not changed).
 */
export function creerIcone(site) {
  const icone = site.icone;
  if (icone?.type !== "url" && icone?.type !== "image") return pastilleLettre(site);
  const img = el("img", {
    src: icone.valeur,
    alt: "",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    draggable: "false",
  });
  const cadre = el("span", { class: "tuile-icone tuile-icone--image", "aria-hidden": "true" }, img);
  const lettre = () => cadre.replaceWith(pastilleLettre({ ...site, icone: undefined }));
  img.addEventListener("error", lettre, { once: true });
  if (icone.source === "chrome") verifierCacheNavigateur(img, site, lettre);
  return cadre;
}

/** Purely presentational: receives an element, returns a DOM node. */
export function creerTuile(element) {
  const lien = el("a", {
    class: "tuile tuile--site",
    href: element.url,
    dataset: { id: element.id },
    "aria-label": element.titre,
    draggable: "false",
  });
  lien.append(
    creerIcone(element),
    el("span", { class: "tuile-titre", title: element.titre, texte: element.titre }),
  );
  return lien;
}
