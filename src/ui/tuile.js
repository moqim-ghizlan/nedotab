import { couleurDepuisTexte, lettrePourSite } from "../core/couleurs.js";
import { el } from "./dom.js";

function pastilleLettre(site) {
  return el("span", {
    class: "tuile-icone tuile-icone--lettre",
    style: `background:${(site.icone?.type === "lettre" && site.icone.couleur) || couleurDepuisTexte(site.url)}`,
    "aria-hidden": "true",
    texte: (site.icone?.type === "lettre" && site.icone.texte) || lettrePourSite(site),
  });
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
  img.addEventListener(
    "error",
    () => cadre.replaceWith(pastilleLettre({ ...site, icone: undefined })),
    { once: true },
  );
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
