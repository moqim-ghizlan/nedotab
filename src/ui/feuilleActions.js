import { el } from "./dom.js";

let ouverte = null;

export function fermerFeuilleActions() {
  ouverte?.fermer(false);
}

/**
 * Action sheet at the bottom of the screen (V3.6, phone). Same entries as the context menu
 * ({ libelle, onChoix, danger?, desactive?, info? } or "-"), one 52 px button each, the
 * destructive one in red and last, "Annuler" apart. The tile that was pressed stays visible,
 * enlarged, above the dimmed page. A tap on the dimmed page closes the sheet, but only once
 * the finger that opened it (long press) has been lifted, otherwise that lift would close it.
 *
 * @param {{ entrees: Array, libelle: string, tuile?: HTMLElement, retourFocus?: HTMLElement }} options
 * @returns {{ fermer: (rendreFocus?: boolean) => void }}
 */
export function ouvrirFeuilleActions({ entrees, libelle, tuile, retourFocus }) {
  fermerFeuilleActions();
  const actives = entrees.filter((e) => e !== "-");
  let arme = false;
  const armer = () => {
    clearTimeout(secours);
    setTimeout(() => (arme = true), 60);
  };
  const secours = setTimeout(() => (arme = true), 1500);
  document.addEventListener("pointerup", armer, { once: true, capture: true });
  document.addEventListener("pointercancel", armer, { once: true, capture: true });

  const boutons = actives.map((e) =>
    el(
      "button",
      {
        type: "button",
        class: `feuille-entree${e.danger ? " feuille-entree--danger" : ""}`,
        "aria-disabled": e.desactive ? "true" : null,
        onclick: () => {
          if (e.desactive) return;
          fermer(false);
          e.onChoix();
        },
      },
      el("span", { texte: e.libelle }),
      e.desactive && e.info ? el("small", { class: "feuille-info", texte: e.info }) : null,
    ),
  );
  const annuler = el("button", {
    type: "button",
    class: "feuille-entree feuille-annuler",
    texte: "Annuler",
    onclick: () => fermer(true),
  });

  const corps = el(
    "div",
    { class: "feuille-corps", role: "dialog", "aria-label": libelle, "aria-modal": "true" },
    el("div", { class: "feuille-titre", texte: libelle }),
    el("div", { class: "feuille-liste" }, boutons),
    annuler,
  );
  const voile = el("div", {
    class: "feuille-voile",
    onclick: () => {
      if (arme) fermer(true);
    },
  });
  const racine = el("div", { class: "feuille-actions" }, voile);

  // The pressed tile, enlarged above the dimmed page (a copy: the real one stays in place).
  if (tuile) {
    const r = tuile.getBoundingClientRect();
    const copie = tuile.cloneNode(true);
    copie.removeAttribute("href");
    copie.classList.add("feuille-tuile");
    copie.setAttribute("aria-hidden", "true");
    copie.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    racine.append(copie);
  }
  racine.append(corps);

  const surTouche = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      fermer(true);
    }
  };

  function fermer(rendreFocus) {
    if (ouverte?.racine !== racine) return;
    ouverte = null;
    clearTimeout(secours);
    document.removeEventListener("keydown", surTouche, true);
    document.removeEventListener("pointerup", armer, true);
    document.removeEventListener("pointercancel", armer, true);
    if (racine.matches?.(":popover-open")) racine.hidePopover();
    racine.remove();
    if (rendreFocus) retourFocus?.focus();
  }

  const modales = document.querySelectorAll("dialog[open]");
  const parent = [...modales].reverse().find((d) => d.matches(":modal")) ?? document.body;
  parent.append(racine);
  if (typeof racine.showPopover === "function") {
    racine.popover = "manual";
    racine.showPopover();
  }
  document.addEventListener("keydown", surTouche, true);
  ouverte = { racine, fermer };
  boutons[0]?.focus({ preventScroll: true });
  return ouverte;
}
