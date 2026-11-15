/**
 * Page layout of the PDF of a todo (7.3). Pure: a description of the document and a text meter
 * in, bytes out. No dependency (the writer of pdf.js knows only plain text lines): this file draws
 * rectangles, hairlines, coloured texts and several JPEG pictures on A4 pages.
 *
 * Document: a header (subject, title, details), then one BLOCK per piste (number, title, text,
 * picture), then a footer on every page ("NedoTab", date, "Page n / N").
 *
 * Pagination rules:
 *  - a block that fits in the room left stays whole; one that does not goes to the next page when
 *    it can fit there; a block taller than a page flows on (the text goes on, the picture moves
 *    to the page where it fits);
 *  - a heading is never alone at the bottom of a page (it stays with at least two lines);
 *  - a picture is never cut: it keeps its ratio, at most the column wide and 300 pt high.
 */
import { decouperLignes, textePdf } from "./pdf.js";

export const PAGE = { largeur: 595.28, hauteur: 841.89 };
const MARGE_X = 56;
const MARGE_HAUT = 60;
const MARGE_BAS = 64;
const COLONNE = PAGE.largeur - 2 * MARGE_X;
const RETRAIT = 14; // text of a piste, inside its accent bar
const LARGEUR_TEXTE = COLONNE - RETRAIT;
const HAUTEUR_IMAGE_MAX = 300;

const ACCENT = [0.173, 0.42, 0.353];
const TEXTE = [0.11, 0.14, 0.12];
const GRIS = [0.42, 0.45, 0.43];
const FILET = [0.82, 0.85, 0.83];

const nb = (n) => String(Math.round(n * 100) / 100);
const couleur = (c) => c.map(nb).join(" ");
const echapper = (t) => t.replace(/([\\()])/g, "\\$1");
const octets = (chaine) => Uint8Array.from(chaine, (c) => c.charCodeAt(0) & 0xff);

/** One page's drawing operators. */
class Page {
  constructor() {
    this.ops = [];
  }
  texte(t, x, baseline, taille, { gras = false, rgb = TEXTE, espacement = 0 } = {}) {
    if (!t) return;
    this.ops.push(
      `BT /${gras ? "F2" : "F1"} ${nb(taille)} Tf ${couleur(rgb)} rg ${espacement ? `${nb(espacement)} Tc ` : ""}${nb(x)} ${nb(baseline)} Td (${echapper(t)}) Tj ET`,
    );
  }
  rect(x, y, w, h, rgb) {
    this.ops.push(`${couleur(rgb)} rg ${nb(x)} ${nb(y)} ${nb(w)} ${nb(h)} re f`);
  }
  cadre(x, y, w, h, rgb, epaisseur = 0.6) {
    this.ops.push(`${couleur(rgb)} RG ${nb(epaisseur)} w ${nb(x)} ${nb(y)} ${nb(w)} ${nb(h)} re S`);
  }
  filet(x1, y, x2, rgb, epaisseur = 0.6) {
    this.ops.push(`${couleur(rgb)} RG ${nb(epaisseur)} w ${nb(x1)} ${nb(y)} m ${nb(x2)} ${nb(y)} l S`);
  }
  image(indice, x, y, w, h) {
    this.ops.push(`q ${nb(w)} 0 0 ${nb(h)} ${nb(x)} ${nb(y)} cm /Im${indice} Do Q`);
  }
}

/**
 * Lays the document out.
 * @param {object} doc
 * @param {string} doc.titre
 * @param {string} [doc.sujet]
 * @param {string[]} [doc.infos] short details under the title ("Créé le…", "Fait"…)
 * @param {{ titre?: string, description?: string, image?: { octets: Uint8Array, largeur: number, hauteur: number }|null,
 *           imageIndisponible?: boolean }[]} doc.pistes
 * @param {string} [doc.date] date of the export, shown in the footer
 * @param {(texte: string, taille: number, gras: boolean) => number} mesurer width in points
 * @returns {{ pages: string[][], images: { octets: Uint8Array, largeur: number, hauteur: number }[] }}
 */
export function mettreEnPage(doc, mesurer) {
  const pages = [new Page()];
  const images = [];
  let y = PAGE.hauteur - MARGE_HAUT; // top of the next element
  const page = () => pages.at(-1);
  const limite = MARGE_BAS;
  const reste = () => y - limite;
  const nouvellePage = () => {
    pages.push(new Page());
    y = PAGE.hauteur - MARGE_HAUT;
  };
  const coupe = (texte, taille, gras, largeur) =>
    decouperLignes(textePdf(texte), largeur, (t) => mesurer(t, taille, gras));
  const baseline = (haut, hauteurLigne, taille) => haut - hauteurLigne / 2 - taille * 0.33;

  // --- Header ----------------------------------------------------------------------------------
  if (doc.sujet) {
    page().texte(textePdf(doc.sujet).toUpperCase(), MARGE_X, baseline(y, 14, 8.5), 8.5, { gras: true, rgb: ACCENT, espacement: 0.9 });
    y -= 18;
  }
  const titre = coupe(String(doc.titre ?? "").replace(/\s+/g, " ").trim() || "Sans titre", 24, true, COLONNE);
  for (const l of titre) {
    page().texte(l, MARGE_X, baseline(y, 30, 24), 24, { gras: true });
    y -= 30;
  }
  y -= 4;
  const infos = (doc.infos ?? []).filter(Boolean).join("   ·   ");
  if (infos) {
    for (const l of coupe(infos, 9.5, false, COLONNE)) {
      page().texte(l, MARGE_X, baseline(y, 14, 9.5), 9.5, { rgb: GRIS });
      y -= 14;
    }
  }
  y -= 10;
  page().rect(MARGE_X, y - 2, 42, 2.4, ACCENT);
  page().filet(MARGE_X + 42, y - 0.8, MARGE_X + COLONNE, FILET, 0.6);
  y -= 26;

  // --- Pistes ----------------------------------------------------------------------------------
  const pistes = doc.pistes ?? [];
  if (pistes.length === 0) {
    page().texte("Aucune piste.", MARGE_X, baseline(y, 16, 10.5), 10.5, { rgb: GRIS });
    y -= 16;
  }
  pistes.forEach((piste, i) => {
    const numero = String(i + 1).padStart(2, "0");
    const nom = String(piste.titre ?? "").replace(/\s+/g, " ").trim();
    const lignesTitre = coupe(nom, 13, true, LARGEUR_TEXTE - 30);
    const lignesTexte = piste.description?.trim() ? coupe(piste.description, 10.5, false, LARGEUR_TEXTE) : [];
    const hLigne = 10.5 * 1.5;
    const hEntete = (nom ? lignesTitre.length * 18 : 18) + 4;
    const image = piste.image ?? null;
    let wImg = 0;
    let hImg = 0;
    if (image) {
      const echelle = Math.min(LARGEUR_TEXTE / image.largeur, HAUTEUR_IMAGE_MAX / image.hauteur, 1);
      wImg = image.largeur * echelle;
      hImg = image.hauteur * echelle;
    }
    const hNote = piste.imageIndisponible ? 18 : 0;
    const hTexte = lignesTexte.length * hLigne;
    const hTout = hEntete + hTexte + (hTexte ? 6 : 0) + (image ? hImg + 14 : 0) + hNote;
    const hPage = PAGE.hauteur - MARGE_HAUT - MARGE_BAS;

    // Whole block: stays together when it fits on a page, else the text flows on.
    if (hTout > reste() && hTout <= hPage) nouvellePage();
    // Heading + at least two lines (or the picture) together.
    const minimum = hEntete + Math.min(lignesTexte.length, 2) * hLigne + (lignesTexte.length ? 0 : image ? Math.min(hImg, 120) : 0);
    if (minimum > reste()) nouvellePage();

    let debutBarre = y;
    const fermerBarre = () => {
      const bas = y;
      if (debutBarre - bas > 2) pages.at(-1).rect(MARGE_X, bas + 2, 2.4, debutBarre - bas - 2, ACCENT);
    };

    // Number and title.
    const xTexte = MARGE_X + RETRAIT;
    page().texte(numero, xTexte, baseline(y, 18, 9), 9, { gras: true, rgb: ACCENT, espacement: 0.6 });
    if (nom) {
      for (const l of lignesTitre) {
        page().texte(l, xTexte + 24, baseline(y, 18, 13), 13, { gras: true });
        y -= 18;
      }
    } else {
      y -= 18;
    }
    y -= 4;

    // Text (continues on the next page when it does not fit).
    for (const l of lignesTexte) {
      if (hLigne > reste()) {
        fermerBarre();
        nouvellePage();
        debutBarre = y;
      }
      page().texte(l, xTexte, baseline(y, hLigne, 10.5), 10.5);
      y -= hLigne;
    }
    if (hTexte) y -= 6;

    // Picture (whole).
    if (image) {
      if (hImg + 14 > reste()) {
        fermerBarre();
        nouvellePage();
        debutBarre = y;
      }
      y -= 6;
      images.push(image);
      page().image(images.length, xTexte, y - hImg, wImg, hImg);
      page().cadre(xTexte, y - hImg, wImg, hImg, FILET, 0.6);
      y -= hImg + 8;
    }
    if (piste.imageIndisponible) {
      if (hNote > reste()) {
        fermerBarre();
        nouvellePage();
        debutBarre = y;
      }
      page().texte("Image indisponible au moment de l'export.", xTexte, baseline(y, 18, 9.5), 9.5, { rgb: GRIS });
      y -= 18;
    }
    fermerBarre();
    y -= 22;
  });

  // --- Footer on every page ---------------------------------------------------------------------
  const total = pages.length;
  const pied = textePdf(doc.titre ? `NedoTab  ·  ${String(doc.titre).replace(/\s+/g, " ").trim()}` : "NedoTab");
  pages.forEach((p, i) => {
    p.filet(MARGE_X, 46, MARGE_X + COLONNE, FILET, 0.6);
    let gauche = pied;
    if (mesurer(gauche, 8, false) > COLONNE - 150) {
      while (gauche.length > 3 && mesurer(`${gauche}...`, 8, false) > COLONNE - 150) gauche = gauche.slice(0, -1);
      gauche = `${gauche}...`;
    }
    p.texte(gauche, MARGE_X, 32, 8, { rgb: GRIS });
    const droite = textePdf(`${doc.date ? `${doc.date}   ·   ` : ""}Page ${i + 1} / ${total}`);
    p.texte(droite, MARGE_X + COLONNE - mesurer(droite, 8, false), 32, 8, { rgb: GRIS });
  });
  return { pages: pages.map((p) => p.ops), images };
}

/**
 * Writes the pages as a PDF (standard fonts, JPEG pictures as DCT streams).
 * @param {{ pages: string[][], images: { octets: Uint8Array, largeur: number, hauteur: number }[] }} d
 * @returns {Uint8Array}
 */
export function ecrirePdf({ pages, images }) {
  // Objects: 1 catalog, 2 pages, 3-4 fonts, then the pictures, then a content + a page each.
  const premierObjetImage = 5;
  const premierePage = premierObjetImage + images.length;
  const objets = new Map();
  objets.set(1, [octets("<< /Type /Catalog /Pages 2 0 R >>")]);
  const ids = pages.map((_, i) => premierePage + 2 * i + 1);
  objets.set(2, [octets(`<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((i) => `${i} 0 R`).join(" ")}] >>`)]);
  objets.set(3, [octets("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")]);
  objets.set(4, [octets("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")]);
  images.forEach((image, i) => {
    objets.set(premierObjetImage + i, [
      octets(`<< /Type /XObject /Subtype /Image /Width ${image.largeur} /Height ${image.hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.octets.length} >>\nstream\n`),
      image.octets,
      octets("\nendstream"),
    ]);
  });
  const xobjets = images.length ? ` /XObject << ${images.map((_, i) => `/Im${i + 1} ${premierObjetImage + i} 0 R`).join(" ")} >>` : "";
  const ressources = `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjets} >>`;
  pages.forEach((ops, i) => {
    const flux = octets(ops.join("\n"));
    const idContenu = premierePage + 2 * i;
    objets.set(idContenu, [octets(`<< /Length ${flux.length} >>\nstream\n`), flux, octets("\nendstream")]);
    objets.set(idContenu + 1, [octets(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nb(PAGE.largeur)} ${nb(PAGE.hauteur)}] ${ressources} /Contents ${idContenu} 0 R >>`)]);
  });

  const morceaux = [octets("%PDF-1.4\n%âãÏÓ\n")];
  let decalage = morceaux[0].length;
  const positions = [];
  const total = objets.size;
  for (let id = 1; id <= total; id++) {
    positions[id] = decalage;
    for (const p of [octets(`${id} 0 obj\n`), ...objets.get(id), octets("\nendobj\n")]) {
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

/** The PDF of a document. */
export const creerPdfTodo = (doc, mesurer) => ecrirePdf(mettreEnPage(doc, mesurer));
