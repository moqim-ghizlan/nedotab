/**
 * References to the user's sites in the answers of the chat (V4.14). The model writes
 * `[[site:sN]]` to cite a site of the collection; the application turns the reference into a
 * card built in the DOM. A reference is never interpreted as HTML:
 *   1. outside the code (``` blocks and `inline code`), each valid reference is replaced by a
 *      private-use token in the Markdown text (so lists and sentences keep their structure);
 *   2. the text goes through markdown.js (marked + DOMPurify) as usual;
 *   3. the tokens, which are plain text in the sanitised fragment, are replaced by cards made
 *      with `el()` (textContent only).
 * The server answers with { "s12": real id } for the sites cited: `traduireReferences` writes
 * the real ids into the text that is kept (the numbering changes from one answer to the next).
 */
import { domaine } from "../../core/url.js";
import { el } from "../dom.js";
import { creerIcone, ouvrirSite, sitesDansNouvelOnglet } from "../tuile.js";
import { rendreMarkdown } from "./markdown.js";

/** A complete reference: only letters, digits, "_" and "-" (anything else stays plain text). */
const REFERENCE = /\[\[site:([\w?-]{1,64})\]\]/g;
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;
const JETON = /(\d+)/g;
export const INCONNU = "?";
const COURT = /^s\d+$/;

/** Applies `f(id)` to every complete reference outside the code. */
export function remplacerReferences(texte, f) {
  return String(texte ?? "")
    .split(CODE)
    .map((morceau, i) => (i % 2 ? morceau : morceau.replace(REFERENCE, (_, id) => f(id))))
    .join("");
}

/** The identifiers cited outside the code, in order of appearance, without repetition. */
export function referencesDe(texte) {
  const ids = [];
  remplacerReferences(texte, (id) => (ids.includes(id) || ids.push(id), ""));
  return ids;
}

/** "s12" → real id from the table of the answer; an id absent from it becomes "?". */
export function traduireReferences(texte, table = {}) {
  return remplacerReferences(texte, (id) =>
    COURT.test(id) ? `[[site:${Object.hasOwn(table, id) ? table[id] : INCONNU}]]` : `[[site:${id}]]`,
  );
}

/** The text sent back to the server as history: a reference becomes the title of the site. */
export function texteSansReferences(texte, trouver) {
  return remplacerReferences(texte, (id) => {
    const site = COURT.test(id) ? null : trouver(id);
    return site ? `« ${site.titre} »` : "(site de la collection)";
  });
}

/**
 * @param {{ id: string, site: object, titre: string, url: string, chemin: string[] }} site
 * @param {{ afficher?: (id: string) => void }} actions
 */
function carteSite(site, { afficher }) {
  const sur = /^https?:\/\//i.test(site.url);
  const detail = [domaine(site.url), ...(site.chemin.length ? [site.chemin.join(" › ")] : [])].join(
    " · ",
  );
  const contenu = [
    creerIcone(site.site),
    el("span", { class: "chat-site-titre", texte: site.titre }),
    el("span", { class: "chat-site-detail", texte: detail }),
  ];
  const lien = sur
    ? el("a", {
        class: "chat-site-lien",
        href: site.url,
        title: site.url,
        onclick: (e) => {
          // Plain click: current tab (or the new tab of the settings); Ctrl/Cmd/Shift: the browser's own.
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          ouvrirSite(site.url, { nouvelOnglet: sitesDansNouvelOnglet(), id: site.id });
        },
      }, ...contenu)
    : el("span", { class: "chat-site-lien" }, ...contenu);
  return el(
    "span",
    { class: "chat-site", dataset: { site: site.id } },
    lien,
    afficher
      ? el("button", {
          type: "button",
          class: "chat-site-grille",
          texte: "Afficher dans la grille",
          onclick: () => afficher(site.id),
        })
      : null,
  );
}

const cartePassive = (classe, texte) => el("span", { class: `chat-site chat-site--${classe}`, texte });

/**
 * The card of one reference. `fluxEnCours`: a short id ("s3") is not translated yet (the table
 * arrives with the end of the stream), a quiet placeholder is shown meanwhile.
 */
function noeudReference(id, { trouver, afficher, fluxEnCours }) {
  if (COURT.test(id)) {
    return fluxEnCours ? cartePassive("attente", "…") : cartePassive("introuvable", "(site introuvable)");
  }
  const site = id === INCONNU ? null : trouver(id);
  return site ? carteSite(site, { afficher }) : cartePassive("introuvable", "(site introuvable)");
}

/**
 * @param {string} texte Markdown of an answer
 * @param {{ trouver: (id: string) => object|null, afficher?: (id: string) => void,
 *   fluxEnCours?: boolean }} options
 * @returns {DocumentFragment}
 */
export function rendreAvecSites(texte, { trouver, afficher, fluxEnCours = false }) {
  const refs = [];
  const balise = String(texte ?? "").replace(/[]/g, "");
  const marque = remplacerReferences(balise, (id) => `${refs.push(id) - 1}`);
  const fragment = rendreMarkdown(marque);
  if (!refs.length) return fragment;
  const racine = document.createElement("div");
  racine.append(fragment);
  const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  const noeuds = [];
  for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
    if (n.nodeValue.includes("")) noeuds.push(n);
  }
  for (const n of noeuds) {
    // An indented code block is not seen by remplacerReferences: the reference stays as written.
    if (n.parentElement?.closest("pre, code")) {
      n.nodeValue = n.nodeValue.replace(JETON, (_, i) => `[[site:${refs[Number(i)]}]]`);
      continue;
    }
    const morceaux = [];
    let pos = 0;
    for (const m of n.nodeValue.matchAll(JETON)) {
      if (m.index > pos) morceaux.push(document.createTextNode(n.nodeValue.slice(pos, m.index)));
      const id = refs[Number(m[1])];
      morceaux.push(
        id === undefined
          ? document.createTextNode("")
          : noeudReference(id, { trouver, afficher, fluxEnCours }),
      );
      pos = m.index + m[0].length;
    }
    if (pos < n.nodeValue.length) morceaux.push(document.createTextNode(n.nodeValue.slice(pos)));
    n.replaceWith(...morceaux);
  }
  const sortie = document.createDocumentFragment();
  sortie.append(...racine.childNodes);
  return sortie;
}
