/** Line icons (24 × 24, drawn with currentColor), kept in the code: no icon font, no CDN. */
const TRACES = {
  apparence: [
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z",
    "M7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  ],
  general: ["M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7Z", "M16 12h.01"],
  sauvegardes: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  donnees: [
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z",
    "M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
    "M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  ],
  ia: [
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z",
    "M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z",
  ],
  // V5.2: a shield with a check mark (private VPN).
  vpn: ["M12 3l7 3v5.2c0 4.6-2.9 8-7 9.8-4.1-1.8-7-5.2-7-9.8V6l7-3Z", "M9 12l2.2 2.2L15.5 10"],
  avance: ["M4 7h10M18 7h2M4 17h4M12 17h8", "M16 5v4M10 15v4"],
  fermer: ["M6 6l12 12M18 6 6 18"],
  dossier: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"],
  oeil: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  deconnexion: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 17l-5-5 5-5", "M5 12h11"],
  restaurer: ["M4 4v5h5", "M4.6 15a8 8 0 1 0 1.9-8.3L4 9"],
  synchroniser: [
    "M20 12a8 8 0 0 1-14 5.3L4 15",
    "M4 12a8 8 0 0 1 14-5.3L20 9",
    "M4 20v-5h5M20 4v5h-5",
  ],
  // Sharing space, assistant and settings (V4.30).
  partage: ["M4 8h14", "M15 5l3 3-3 3", "M20 16H6", "M9 13l-3 3 3 3"],
  lien: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  texte: ["M5 6h14M5 10h14M5 14h10M5 18h6"],
  trombone: [
    "M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4",
  ],
  coller: [
    "M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1Z",
    "M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1",
  ],
  envoyer: ["M12 19V5", "M6 11l6-6 6 6"],
  arret: ["M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"],
  plus: [
    "M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    "M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    "M20 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  ],
  ajouter: ["M12 5v14M5 12h14"],
  cadenas: [
    "M8 11V8a4 4 0 0 1 8 0v3",
    "M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z",
  ],
  cadenasOuvert: [
    "M8 11V8a4 4 0 0 1 7.7-1.5",
    "M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z",
  ],
  crayon: ["M4 20h4L19 9l-4-4L4 16v4Z", "M13.5 6.5l4 4"],
  epingle: ["M9 4h6l-1 5 3 3H7l3-3-1-5Z", "M12 15v5"],
  horloge: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  copier: [
    "M10 9h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z",
    "M15 9V5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3",
  ],
  coche: ["M5 12.5l4.5 4.5L19 7.5"],
  ouvrir: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  telecharger: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  partager: [
    "M12 3v12",
    "M8 7l4-4 4 4",
    "M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1",
  ],
  poubelle: [
    "M4 7h16",
    "M10 11v6M14 11v6",
    "M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12",
    "M9 7V4h6v3",
  ],
  fichier: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z", "M14 3v5h5"],
  image: [
    "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
    "M4 16l5-5 4 4 2-2 5 5",
    "M15.5 8.5h.01",
  ],
  archive: ["M4 5h16v4H4z", "M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9", "M10 13h4"],
  audio: [
    "M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm0 0V5l10-2v13",
    "M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z",
  ],
  video: [
    "M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
    "M16 10l5-3v10l-5-3",
  ],
  nouvelle: [
    "M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6",
    "M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 8.5-8.5Z",
  ],
  compte: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  grille: [
    "M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
    "M15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
    "M5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z",
    "M15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z",
  ],
  retour: ["M15 5l-7 7 7 7"],
  chevron: ["M9 5l7 7-7 7"],
  bas: ["M12 5v14", "M6 13l6 6 6-6"],
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
  // An unknown name draws an empty icon instead of breaking the whole panel.
  for (const d of TRACES[nom] ?? []) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
