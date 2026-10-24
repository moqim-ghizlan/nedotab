/** Line icons (24 × 24, drawn with currentColor), kept in the code: no icon font, no CDN. */
const TRACES = {
  apparence: [
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z",
    "M7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  ],
  sauvegardes: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  donnees: [
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z",
    "M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
    "M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  ],
  avance: ["M4 7h10M18 7h2M4 17h4M12 17h8", "M16 5v4M10 15v4"],
  fermer: ["M6 6l12 12M18 6 6 18"],
  deconnexion: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 17l-5-5 5-5", "M5 12h11"],
  restaurer: ["M4 4v5h5", "M4.6 15a8 8 0 1 0 1.9-8.3L4 9"],
  synchroniser: [
    "M20 12a8 8 0 0 1-14 5.3L4 15",
    "M4 12a8 8 0 0 1 14-5.3L20 9",
    "M4 20v-5h5M20 4v5h-5",
  ],
};

export function icone(nom, { taille = 18 } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24",
    width: String(taille),
    height: String(taille),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "icone",
  }))
    svg.setAttribute(k, v);
  for (const d of TRACES[nom]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
