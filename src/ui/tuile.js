import { lettrePourSite } from "../core/couleurs.js";

/** Builds the icon node of a site (letter badge for now). */
export function creerIcone(site) {
  const icone = document.createElement("span");
  icone.className = "tuile-icone tuile-icone--lettre";
  icone.style.background = site.icone?.couleur ?? "var(--accent)";
  icone.textContent = site.icone?.texte || lettrePourSite(site);
  icone.setAttribute("aria-hidden", "true");
  return icone;
}

/** Purely presentational: receives an element, returns a DOM node. */
export function creerTuile(element) {
  const lien = document.createElement("a");
  lien.className = "tuile tuile--site";
  lien.href = element.url;
  lien.dataset.id = element.id;
  lien.setAttribute("aria-label", element.titre);
  const titre = document.createElement("span");
  titre.className = "tuile-titre";
  titre.textContent = element.titre;
  titre.title = element.titre;
  lien.append(creerIcone(element), titre);
  return lien;
}
