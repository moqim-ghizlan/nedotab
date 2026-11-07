/**
 * Minimal PDF writer (V7.1), no dependency: A4 pages of lines of text (Helvetica, French accents)
 * and one JPEG picture. Pure: lines and bytes in, bytes out. A character outside the Latin-1 set
 * (an emoji, an ideogram) is written as "?": the standard fonts of a PDF cannot draw it.
 */
const A4 = { largeur: 595.28, hauteur: 841.89 };
export const MARGE = 50;
const INTERLIGNE = 1.4;

// Windows-1252 (the PDF "WinAnsiEncoding") codes of the characters between 0x80 and 0x9F.
const WIN_ANSI_HAUT = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Code of a character in WinAnsi, or 63 ("?") when the font has no such character. */
export function codeWinAnsi(c) {
  const cp = c.codePointAt(0);
  if (cp === 0xa0 || cp === 9) return 32;
  if (cp >= 32 && cp <= 126) return cp;
  if (cp >= 0xa1 && cp <= 0xff) return cp;
  return WIN_ANSI_HAUT[c] ?? 63;
}

/** The text as the PDF will draw it (unsupported characters replaced, line breaks kept). */
export function textePdf(texte) {
  return [...String(texte ?? "").normalize("NFC").replace(/\r\n?/g, "\n")]
    .map((c) => (c === "\n" ? c : String.fromCharCode(codeWinAnsi(c))))
    .join("");
}

/**
 * Cuts a text into lines no wider than `largeur`. `mesurer(texte)` gives a width: injected, so
 * the cut is testable. A word longer than a line is cut where it overflows. Blank lines are kept.
 */
export function decouperLignes(texte, largeur, mesurer) {
  const sortie = [];
  for (const paragraphe of String(texte).split("\n")) {
    if (!paragraphe.trim()) {
      sortie.push("");
      continue;
    }
    let ligne = "";
    for (const mot of paragraphe.split(/ +/).filter(Boolean)) {
      let essai = ligne ? `${ligne} ${mot}` : mot;
      if (mesurer(essai) <= largeur) {
        ligne = essai;
        continue;
      }
      if (ligne) sortie.push(ligne);
      essai = mot;
      // A very long word (a file name, an address): cut it where it no longer fits.
      while (mesurer(essai) > largeur && essai.length > 1) {
        let n = essai.length - 1;
        while (n > 1 && mesurer(essai.slice(0, n)) > largeur) n--;
        sortie.push(essai.slice(0, n));
        essai = essai.slice(n);
      }
      ligne = essai;
    }
    sortie.push(ligne);
  }
  return sortie;
}

const echapper = (t) => t.replace(/([\\()])/g, "\\$1");
const nb = (n) => String(Math.round(n * 100) / 100);
const octets = (chaine) => Uint8Array.from(chaine, (c) => c.charCodeAt(0) & 0xff);

/**
 * @param {object} d
 * @param {{ texte: string, taille?: number, gras?: boolean, gris?: number, apres?: number }[]} d.lignes
 *        already cut, texte already passed through textePdf()
 * @param {{ octets: Uint8Array, largeur: number, hauteur: number }|null} [d.image] a JPEG
 * @returns {Uint8Array}
 */
export function creerPdf({ lignes, image = null }) {
  const pages = [[]]; // content streams, as lists of operators
  let y = A4.hauteur - MARGE;
  const sautDePage = () => {
    pages.push([]);
    y = A4.hauteur - MARGE;
  };
  for (const l of lignes) {
    const taille = l.taille ?? 12;
    const pas = taille * INTERLIGNE;
    if (y - pas < MARGE) sautDePage();
    y -= pas;
    if (l.texte) pages.at(-1).push(`BT /${l.gras ? "F2" : "F1"} ${nb(taille)} Tf ${nb(l.gris ?? 0)} g ${nb(MARGE)} ${nb(y + taille * 0.25)} Td (${echapper(l.texte)}) Tj ET`);
    y -= l.apres ?? 0;
  }
  if (image) {
    const largeurMax = A4.largeur - 2 * MARGE;
    const hauteurMax = A4.hauteur - 2 * MARGE;
    const echelle = Math.min(largeurMax / image.largeur, hauteurMax / image.hauteur, 1);
    const w = image.largeur * echelle;
    const h = image.hauteur * echelle;
    if (y - h < MARGE) sautDePage();
    y -= h;
    pages.at(-1).push(`q ${nb(w)} 0 0 ${nb(h)} ${nb(MARGE)} ${nb(y)} cm /Im1 Do Q`);
  }

  // Objects: 1 catalog, 2 pages, 3 and 4 fonts, 5 picture (optional), then a content + a page each.
  const premierePage = image ? 6 : 5;
  const objets = new Map();
  objets.set(1, [octets("<< /Type /Catalog /Pages 2 0 R >>")]);
  const ids = pages.map((_, i) => premierePage + 2 * i + 1);
  objets.set(2, [octets(`<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((i) => `${i} 0 R`).join(" ")}] >>`)]);
  objets.set(3, [octets("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")]);
  objets.set(4, [octets("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")]);
  if (image)
    objets.set(5, [
      octets(`<< /Type /XObject /Subtype /Image /Width ${image.largeur} /Height ${image.hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.octets.length} >>\nstream\n`),
      image.octets,
      octets("\nendstream"),
    ]);
  const ressources = `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${image ? " /XObject << /Im1 5 0 R >>" : ""} >>`;
  pages.forEach((ops, i) => {
    const flux = octets(ops.join("\n"));
    const idContenu = premierePage + 2 * i;
    objets.set(idContenu, [octets(`<< /Length ${flux.length} >>\nstream\n`), flux, octets("\nendstream")]);
    objets.set(idContenu + 1, [octets(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nb(A4.largeur)} ${nb(A4.hauteur)}] ${ressources} /Contents ${idContenu} 0 R >>`)]);
  });

  const morceaux = [octets("%PDF-1.4\n%âãÏÓ\n")];
  let decalage = morceaux[0].length;
  const positions = [];
  const total = objets.size;
  for (let id = 1; id <= total; id++) {
    positions[id] = decalage;
    const debut = octets(`${id} 0 obj\n`);
    const fin = octets("\nendobj\n");
    const parties = [debut, ...objets.get(id), fin];
    for (const p of parties) {
      morceaux.push(p);
      decalage += p.length;
    }
  }
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= total; id++) xref += `${String(positions[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${decalage}\n%%EOF\n`;
  morceaux.push(octets(xref));

  const sortie = new Uint8Array(morceaux.reduce((s, m) => s + m.length, 0));
  let p = 0;
  for (const m of morceaux) {
    sortie.set(m, p);
    p += m.length;
  }
  return sortie;
}
