import { apercuDossier, compterSites } from "../core/arbre.js";
import { el } from "./dom.js";
import { creerGlyphe } from "./glyphes.js";
import { icone as glyphe } from "./icones.js";
import { creerIcone } from "./tuile.js";

/** Accessible label: "Dossier Travail, 7 éléments, 1 sous-dossier". */
export function libelleDossier(dossier) {
  const n = compterSites(dossier);
  const sous = dossier.items.filter((e) => e.type === "dossier").length;
  return (
    `Dossier ${dossier.titre}, ${n} élément${n > 1 ? "s" : ""}` +
    (sous ? `, ${sous} sous-dossier${sous > 1 ? "s" : ""}` : "")
  );
}

/**
 * Folder icon: 2 x 2 preview of the first four DIRECT items. A sub-folder is a small folder
 * glyph (never its own sites). A folder with no item at all is an empty folder.
 */
export function creerIconeDossier(dossier) {
  if (dossier.icone) return creerIconePersonnalisee(dossier);
  const premiers = apercuDossier(dossier, 4);
  const icone = el("span", { class: "tuile-icone tuile-icone--dossier", "aria-hidden": "true" });
  if (premiers.length === 0) {
    icone.classList.add("tuile-icone--dossier-vide");
    return icone;
  }
  if (dossier.items.some((e) => e.type === "dossier"))
    icone.classList.add("tuile-icone--avec-sous");
  for (let i = 0; i < 4; i++) {
    const e = premiers[i];
    if (!e) icone.append(el("span", { class: "mini mini--vide" }));
    else if (e.type === "dossier")
      icone.append(
        el("span", { class: "mini mini--dossier", title: e.titre }, glyphe("dossier", 14)),
      );
    else icone.append(el("span", { class: "mini" }, creerIcone(e)));
  }
  return icone;
}

/**
 * T11: a folder with a custom icon shows it in both folder styles (the user chose it). The
 * sub-folder marker stays: a small folder badge in the corner.
 */
function creerIconePersonnalisee(dossier) {
  const { icone } = dossier;
  const interieur =
    icone.type === "glyphe"
      ? el(
          "span",
          {
            class: "tuile-icone tuile-icone--glyphe",
            style: `background:${icone.couleur}`,
            "aria-hidden": "true",
          },
          creerGlyphe(icone.id, 30),
        )
      : creerIcone({ titre: dossier.titre, icone });
  const cadre = el(
    "span",
    { class: "tuile-icone tuile-icone--dossier tuile-icone--dossier-perso", "aria-hidden": "true" },
    interieur,
  );
  if (dossier.items.some((e) => e.type === "dossier")) {
    cadre.classList.add("tuile-icone--avec-sous");
    cadre.append(el("span", { class: "badge-sous-dossier" }, glyphe("dossier", 12)));
  }
  return cadre;
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
