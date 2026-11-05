import { GLYPHES } from "../core/iconeDossier.js";
import { icone as svgIcone } from "./icones.js";

/** Built-in folder glyphs: local SVG paths (24 x 24, stroke), no remote file. */
const CHEMINS = {
  dossier: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"],
  etoile: ["M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5Z"],
  coeur: ["M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"],
  travail: ["M4 8h16v11H4V8Z", "M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2", "M4 13h16"],
  maison: ["M4 11l8-7 8 7", "M6 10v9h12v-9", "M10 19v-5h4v5"],
  jeux: ["M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L14.5 15h-5l-1.3 1A3 3 0 0 1 3 14v-1a4 4 0 0 1 4-4Z", "M8 11v3M6.5 12.5h3", "M15.5 12h.01M17.5 13.5h.01"],
  musique: ["M9 18V6l10-2v12", "M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z", "M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"],
  etudes: ["M2 9l10-5 10 5-10 5L2 9Z", "M6 11.5V16c0 1.5 2.7 3 6 3s6-1.500 6-3v-4.500"],
  achats: ["M5 8h14l-1 12H6L5 8Z", "M9 8V6a3 3 0 0 1 6 0v2"],
  ia: ["M12 3l1.8 4.7L18.5 9.5l-4.700 1.800L12 16l-1.800-4.700L5.500 9.500l4.700-1.800L12 3Z", "M18 15l.8 2.200L21 18l-2.200.8L18 21l-.8-2.200L15 18l2.200-.8L18 15Z"],
  outils: ["M14.500 6.500a4 4 0 0 0 5 5L11 20a2.100 2.100 0 0 1-3-3l8.500-8.500", "M14.500 6.500l3-3 3 3-3 3"],
  video: ["M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z", "M16 10.500l5-3v9l-5-3"],
};

export const IDS_GLYPHES = GLYPHES;
export const libelleGlyphe = (id) => id.charAt(0).toUpperCase() + id.slice(1);

/** An <svg> of a built-in glyph (falls back to the plain folder). */
export function creerGlyphe(id, taille = 24) {
  const svg = svgIcone("dossier", { taille });
  const chemins = CHEMINS[id] ?? CHEMINS.dossier;
  for (const p of [...svg.querySelectorAll("path")]) p.remove();
  for (const d of chemins) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
