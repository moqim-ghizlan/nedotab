import { el } from "./dom.js";

/**
 * Row of duration choices (radio group), shared by the send form and the "Modifier" window of
 * the sharing space (T4). Same markup as before: `.partage-durees` / `.partage-duree`.
 * options: { id, libelle, desactive?, raison? }; a disabled option explains why on hover.
 * @returns {{ racine: HTMLElement, definir: (id: string|null) => void, lire: () => string|null }}
 */
export function creerSelecteurDuree({
  options,
  valeur = null,
  onChoix = () => {},
  libelle,
  decritPar,
}) {
  let courant = valeur;
  const boutons = options.map((o) =>
    el("button", {
      type: "button",
      role: "radio",
      class: "partage-duree",
      dataset: { duree: o.id },
      disabled: o.desactive || null,
      title: o.desactive ? (o.raison ?? "") : null,
      texte: o.libelle,
      onclick: () => {
        definir(o.id);
        onChoix(o.id);
      },
    }),
  );
  const racine = el(
    "div",
    {
      class: "partage-durees",
      role: "radiogroup",
      "aria-label": libelle,
      "aria-describedby": decritPar ?? null,
    },
    boutons,
  );
  function definir(id) {
    courant = id;
    for (const b of boutons) b.setAttribute("aria-checked", String(b.dataset.duree === id));
  }
  definir(courant);
  return { racine, definir, lire: () => courant };
}
