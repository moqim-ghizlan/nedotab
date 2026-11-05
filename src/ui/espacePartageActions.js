import { el } from "./dom.js";
import { icone } from "./icones.js";
import { fermerMenu, ouvrirMenu } from "./menuContextuel.js";

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
 * The row of actions of a card. The main actions stay in view; the others open in a floating
 * menu anchored to the "⋯" button (it flips above the button near the bottom edge and never
 * moves the cards below). The secondary buttons are the source of truth: a menu entry just
 * triggers its button, so every action keeps its own logic. `_ouverts` is kept for
 * compatibility and is no longer used.
 */
export function rangeeActions(id, primaires, secondaires, _ouverts) {
  const autres = secondaires.filter(Boolean);
  const plus = autres.length
    ? el(
        "button",
        {
          type: "button",
          class: "partage-action partage-action--plus",
          "aria-label": "Plus d'actions",
          title: "Plus d'actions",
          "aria-haspopup": "menu",
          "aria-expanded": "false",
          onclick: (e) => {
            const bouton = e.currentTarget;
            if (bouton.getAttribute("aria-expanded") === "true") {
              fermerMenu();
              return;
            }
            const rect = bouton.getBoundingClientRect();
            const entrees = [];
            const dangers = [];
            for (const a of autres) {
              const entree = {
                libelle: a.querySelector(".partage-action-libelle")?.textContent ?? a.textContent,
                danger: a.classList.contains("partage-action--danger"),
                onChoix: () => a.click(),
              };
              (entree.danger ? dangers : entrees).push(entree);
            }
            if (dangers.length) entrees.push("-", ...dangers);
            bouton.setAttribute("aria-expanded", "true");
            const menu = ouvrirMenu({
              x: rect.right - 200,
              y: rect.bottom + 4,
              retourFocus: bouton,
              libelle: "Plus d'actions",
              entrees,
            });
            // Anchor above the button when the menu would not fit below it.
            const m = menu.menu;
            const h = m.getBoundingClientRect().height;
            if (rect.bottom + 4 + h > innerHeight - 8) {
              m.style.top = `${Math.max(8, rect.top - h - 4)}px`;
            }
            const obs = new MutationObserver(() => {
              if (!m.isConnected) {
                bouton.setAttribute("aria-expanded", "false");
                obs.disconnect();
              }
            });
            obs.observe(document.body, { childList: true, subtree: true });
          },
        },
        icone("plus", { taille: 18 }),
      )
    : null;
  return el(
    "div",
    { class: "partage-actions", "data-carte": id },
    el("div", { class: "partage-actions-ligne" }, primaires.filter(Boolean), plus),
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
