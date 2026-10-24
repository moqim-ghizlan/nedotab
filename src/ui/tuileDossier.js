import { apercuDossier, compterSites } from "../core/arbre.js";
import { el } from "./dom.js";
import { creerIcone } from "./tuile.js";

/** Accessible label: "Dossier Travail, 7 éléments". */
export function libelleDossier(dossier) {
  const n = compterSites(dossier);
  return `Dossier ${dossier.titre}, ${n} élément${n > 1 ? "s" : ""}`;
}

/** Folder icon: 2 x 2 preview of the first four sites (depth-first), or an empty folder. */
export function creerIconeDossier(dossier) {
  const sites = apercuDossier(dossier, 4);
  const icone = el("span", { class: "tuile-icone tuile-icone--dossier", "aria-hidden": "true" });
  if (sites.length === 0) {
    icone.classList.add("tuile-icone--dossier-vide");
    return icone;
  }
  if (dossier.items.some((e) => e.type === "dossier"))
    icone.classList.add("tuile-icone--avec-sous");
  for (let i = 0; i < 4; i++) {
    const site = sites[i];
    icone.append(
      site
        ? el("span", { class: "mini" }, creerIcone(site))
        : el("span", { class: "mini mini--vide" }),
    );
  }
  return icone;
}

/** A folder is a <button> (it opens a window, it is not a link). */
export function creerTuileDossier(dossier) {
  return el(
    "button",
    {
      type: "button",
      class: "tuile tuile--dossier",
      dataset: { id: dossier.id },
      "aria-label": libelleDossier(dossier),
      "aria-haspopup": "dialog",
    },
    creerIconeDossier(dossier),
    el("span", { class: "tuile-titre", title: dossier.titre, texte: dossier.titre }),
  );
}
