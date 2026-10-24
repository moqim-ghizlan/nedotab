import { el } from "./dom.js";

let ouvert = null;

export function fermerMenu() {
  ouvert?.fermer();
}

/**
 * Generic context menu positioned at (x, y), kept inside the viewport.
 * Entries: { libelle, onChoix, danger?, raccourci? } or "-" for a separator.
 * Keyboard: ↑ ↓ Home End, Enter, Escape. Closes on outside click, scroll and resize.
 */
export function ouvrirMenu({ x, y, entrees, retourFocus, libelle = "Actions" }) {
  fermerMenu();
  const boutons = [];
  const menu = el(
    "div",
    { class: "menu", role: "menu", "aria-label": libelle, tabindex: "-1" },
    entrees.map((e) => {
      if (e === "-") return el("div", { class: "menu-separateur", role: "separator" });
      const bouton = el(
        "button",
        {
          type: "button",
          class: `menu-entree${e.danger ? " menu-entree--danger" : ""}`,
          role: "menuitem",
          tabindex: "-1",
          // A disabled entry stays focusable so that its explanation can be read.
          "aria-disabled": e.desactive ? "true" : null,
          title: e.desactive ? e.info : null,
          onclick: () => {
            if (e.desactive) return;
            fermer(false);
            e.onChoix();
          },
        },
        el("span", { texte: e.libelle }),
        e.desactive && e.info ? el("small", { class: "menu-info", texte: e.info }) : null,
        e.raccourci ? el("kbd", { class: "menu-raccourci", texte: e.raccourci }) : null,
      );
      boutons.push(bouton);
      return bouton;
    }),
  );

  const surTouche = (ev) => {
    const i = boutons.indexOf(document.activeElement);
    const aller = (j) => {
      ev.preventDefault();
      boutons[(j + boutons.length) % boutons.length].focus();
    };
    if (ev.key === "ArrowDown") aller(i + 1);
    else if (ev.key === "ArrowUp") aller(i < 0 ? boutons.length - 1 : i - 1);
    else if (ev.key === "Home") aller(0);
    else if (ev.key === "End") aller(boutons.length - 1);
    else if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      fermer(true);
    } else if (ev.key === "Tab") {
      ev.preventDefault();
      fermer(true);
    }
  };
  const surClicDehors = (ev) => {
    if (!menu.contains(ev.target)) fermer(false);
  };
  const surDefilement = () => fermer(false);

  function fermer(rendreFocus) {
    if (ouvert?.menu !== menu) return;
    ouvert = null;
    if (menu.matches?.(":popover-open")) menu.hidePopover();
    menu.remove();
    document.removeEventListener("pointerdown", surClicDehors, true);
    document.removeEventListener("contextmenu", surClicDehors, true);
    window.removeEventListener("scroll", surDefilement, true);
    window.removeEventListener("resize", surDefilement);
    window.removeEventListener("blur", surDefilement);
    if (rendreFocus) retourFocus?.focus();
  }

  menu.addEventListener("keydown", surTouche);
  // Inside a modal window (folder window, dialog) the menu must belong to it: the rest of
  // the page is inert there and the window is in the top layer, above any z-index. As a
  // popover, the menu also goes to the top layer, above the window.
  const modales = document.querySelectorAll("dialog[open]");
  const parent = [...modales].reverse().find((d) => d.matches(":modal")) ?? document.body;
  parent.append(menu);
  if (typeof menu.showPopover === "function") {
    menu.popover = "manual";
    menu.showPopover();
  }
  const { width, height } = menu.getBoundingClientRect();
  const marge = 8;
  menu.style.left = `${Math.max(marge, Math.min(x, innerWidth - width - marge))}px`;
  menu.style.top = `${Math.max(marge, y + height > innerHeight - marge ? y - height : y)}px`;
  document.addEventListener("pointerdown", surClicDehors, true);
  document.addEventListener("contextmenu", surClicDehors, true);
  window.addEventListener("scroll", surDefilement, true);
  window.addEventListener("resize", surDefilement);
  window.addEventListener("blur", surDefilement);
  ouvert = { menu, fermer: () => fermer(false) };
  (boutons[0] ?? menu).focus();
  return ouvert;
}
