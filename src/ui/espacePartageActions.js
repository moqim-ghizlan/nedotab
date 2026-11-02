import { el } from "./dom.js";
import { icone } from "./icones.js";

/**
 * Buttons of the sharing-space cards (V4.30): an icon and its label, the label being the
 * button's whole text. The main actions stay in view; the others wait behind "Plus".
 */
export function boutonAction(nom, libelle, { classe = "", ...attributs } = {}) {
  return el(
    "button",
    { type: "button", class: `partage-action ${classe}`.trim(), ...attributs },
    icone(nom, { taille: 16 }),
    el("span", { class: "partage-action-libelle", texte: libelle }),
  );
}

export function lienAction(nom, libelle, href) {
  return el(
    "a",
    { class: "partage-action", href, target: "_blank", rel: "noopener noreferrer" },
    icone(nom, { taille: 16 }),
    el("span", { class: "partage-action-libelle", texte: libelle }),
  );
}

/** Shows a short confirmation on a button ("Copié ✓"), then its label again. */
export function confirmerAction(bouton, texte, duree = 1500) {
  const libelle = bouton.querySelector(".partage-action-libelle") ?? bouton;
  const avant = libelle.textContent;
  libelle.textContent = texte;
  bouton.classList.add("partage-action--fait");
  setTimeout(() => {
    libelle.textContent = avant;
    bouton.classList.remove("partage-action--fait");
  }, duree);
}

/**
 * The row of actions of a card. `ouverts` remembers the cards whose drawer is open: the list
 * is drawn again often (typing, timers), the drawer must not close by itself.
 */
export function rangeeActions(id, primaires, secondaires, ouverts) {
  const autres = secondaires.filter(Boolean);
  const ouvert = ouverts.has(id);
  const tiroir = el(
    "div",
    { class: "partage-tiroir", id: `partage-tiroir-${id}`, hidden: !ouvert },
    autres,
  );
  const plus = autres.length
    ? el(
        "button",
        {
          type: "button",
          class: "partage-action partage-action--plus",
          "aria-label": "Plus d'actions",
          title: "Plus d'actions",
          "aria-expanded": String(ouvert),
          "aria-controls": tiroir.id,
          onclick: (e) => {
            const oui = tiroir.hidden;
            tiroir.hidden = !oui;
            e.currentTarget.setAttribute("aria-expanded", String(oui));
            if (oui) ouverts.add(id);
            else ouverts.delete(id);
          },
        },
        icone("plus", { taille: 18 }),
      )
    : null;
  return el(
    "div",
    { class: "partage-actions" },
    el("div", { class: "partage-actions-ligne" }, primaires.filter(Boolean), plus),
    autres.length ? tiroir : null,
  );
}

/** The square on the left of a card: the kind of item, or the picture of a file. */
export function tuileType(nom, variante) {
  return el(
    "span",
    { class: `partage-vignette partage-vignette--${variante}`, "aria-hidden": "true" },
    icone(nom, { taille: 20 }),
  );
}
