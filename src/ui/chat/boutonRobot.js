import { el } from "../dom.js";
import { visibiliteRobot } from "./geometrie.js";

const NS = "http://www.w3.org/2000/svg";

function forme(tag, attributs) {
  const noeud = document.createElementNS(NS, tag);
  for (const [cle, valeur] of Object.entries(attributs)) noeud.setAttribute(cle, valeur);
  return noeud;
}

/** The robot, drawn here (a round head, an antenna, two eyes): no icon taken from a product. */
export function iconeRobot() {
  const svg = forme("svg", {
    viewBox: "0 0 24 24",
    width: "26",
    height: "26",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.append(
    forme("path", { d: "M12 3.2v2.6" }),
    forme("circle", { cx: "12", cy: "2.7", r: "0.9", fill: "currentColor", stroke: "none" }),
    forme("rect", { x: "4", y: "5.8", width: "16", height: "12.4", rx: "4.2" }),
    forme("path", { d: "M2 10.5v3M22 10.5v3" }),
    forme("circle", { cx: "9", cy: "11.4", r: "1.2", fill: "currentColor", stroke: "none" }),
    forme("circle", { cx: "15", cy: "11.4", r: "1.2", fill: "currentColor", stroke: "none" }),
    forme("path", { d: "M9 15.1c1.8 1.2 4.2 1.2 6 0" }),
    forme("path", { d: "M8.5 21h7" }),
  );
  return svg;
}

/** Floating button at the bottom right (V4.11): opens the assistant. */
export function creerBoutonRobot({ surClic }) {
  const bouton = el(
    "button",
    {
      type: "button",
      class: "robot-bouton",
      "aria-label": "Ouvrir l'assistant",
      title: "Assistant (Ctrl+I)",
      hidden: true,
      onclick: surClic,
    },
    iconeRobot(),
  );
  // V4.18: hidden while scrolling down, back when scrolling up (as usual on iOS).
  let etat = { cache: false, repere: 0 };
  globalThis.addEventListener?.(
    "scroll",
    () => {
      etat = visibiliteRobot({ ...etat, y: globalThis.scrollY ?? 0 });
      bouton.classList.toggle("robot-bouton--cache", etat.cache);
    },
    { passive: true },
  );
  return bouton;
}
