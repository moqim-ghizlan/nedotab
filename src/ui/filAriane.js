import { el } from "./dom.js";
import { ouvrirMenu } from "./menuContextuel.js";

/** Below this width, the middle segments of a long trail collapse into "…". */
const LARGEUR_ETROITE = 560;

/**
 * Breadcrumb trail: Accueil › Travail › Clients. Every segment but the last is a button;
 * `aller(id)` is called with the folder id (null = Accueil). The last one is the current
 * place (aria-current="location").
 * @param {{ id: string|null, titre: string }[]} segments from home to the current folder
 */
export function rendreFilAriane(conteneur, segments, { aller }) {
  const replier = segments.length > 3 && window.innerWidth < LARGEUR_ETROITE;
  const visibles = replier ? [segments[0], null, ...segments.slice(-2)] : segments;
  const liste = el("ol", { class: "ariane" });
  visibles.forEach((s, i) => {
    const dernier = i === visibles.length - 1;
    let contenu;
    if (s === null) {
      const caches = segments.slice(1, -2);
      contenu = el("button", {
        type: "button",
        class: "ariane-segment",
        "aria-label": "Dossiers intermédiaires",
        texte: "…",
        onclick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ouvrirMenu({
            x: r.left,
            y: r.bottom + 4,
            retourFocus: e.currentTarget,
            libelle: "Dossiers intermédiaires",
            entrees: caches.map((c) => ({ libelle: c.titre, onChoix: () => aller(c.id) })),
          });
        },
      });
    } else if (dernier) {
      contenu = el("span", { class: "ariane-courant", "aria-current": "location", texte: s.titre });
    } else {
      contenu = el("button", {
        type: "button",
        class: "ariane-segment",
        dataset: { cible: s.id ?? "" },
        texte: s.titre,
        onclick: () => aller(s.id),
      });
    }
    liste.append(el("li", { class: "ariane-element" }, contenu));
  });
  conteneur.replaceChildren(liste);
}
