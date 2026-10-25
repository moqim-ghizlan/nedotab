import { el } from "../dom.js";

/** Above this number of pages, the dots give way to "‹ 3 / 14 ›". */
export const POINTS_MAX = 10;

/**
 * Page indicator under the home pages (V2.11): hidden for one page, a dot per page up to
 * POINTS_MAX, then a compact form. Its height is always kept so that showing or hiding it
 * never changes the room of the pages.
 */
export function creerIndicateur({ allerA }) {
  const racine = el("nav", { class: "indicateur-pages", "aria-label": "Pages" });
  const pastille = el("div", { class: "indicateur-pastille" });
  racine.append(pastille);
  let etat = { page: -1, nb: 0, temporaire: false };

  const point = (i, nb) =>
    el(
      "button",
      {
        type: "button",
        class: "indicateur-point",
        "aria-label": `Page ${i + 1} sur ${nb}`,
        dataset: { page: String(i) },
        onclick: () => allerA(i),
      },
      el("span", { class: "indicateur-point-marque", "aria-hidden": "true" }),
    );

  const fleche = (sens, libelle) =>
    el("button", {
      type: "button",
      class: "indicateur-fleche",
      "aria-label": libelle,
      texte: sens < 0 ? "‹" : "›",
      onclick: () => allerA(etat.page + sens),
    });

  /** `temporaire`: the empty page shown after the last one during a drag. */
  function maj(page, nb, { temporaire = false } = {}) {
    const compact = nb > POINTS_MAX;
    const structure = etat.nb !== nb || etat.temporaire !== temporaire || etat.compact !== compact;
    etat = { page, nb, temporaire, compact };
    racine.classList.toggle("indicateur-pages--masque", nb <= 1 && !temporaire);
    if (compact) {
      pastille.replaceChildren(
        fleche(-1, "Page précédente"),
        el("span", {
          class: "indicateur-compte",
          texte: temporaire && page >= nb ? `+ / ${nb}` : `${page + 1} / ${nb}`,
        }),
        fleche(1, "Page suivante"),
      );
      return;
    }
    if (structure) {
      pastille.replaceChildren(...Array.from({ length: nb }, (_, i) => point(i, nb)));
      if (temporaire) {
        pastille.append(
          el(
            "span",
            {
              class: "indicateur-point indicateur-point--temporaire",
              dataset: { page: String(nb) },
            },
            el("span", { class: "indicateur-point-marque", "aria-hidden": "true" }),
          ),
        );
      }
    }
    for (const b of pastille.querySelectorAll(".indicateur-point")) {
      const actif = Number(b.dataset.page) === page;
      b.classList.toggle("indicateur-point--actif", actif);
      if (b.tagName === "BUTTON") {
        if (actif) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      }
    }
  }

  /** Page of the dot under (x, y), or null: hovering a dot during a drag goes there. */
  function pageSous(x, y) {
    for (const b of pastille.querySelectorAll(".indicateur-point")) {
      const r = b.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return Number(b.dataset.page);
    }
    return null;
  }

  return { racine, maj, pageSous };
}
