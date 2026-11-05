/**
 * Markdown of the todo descriptions (V6.3). The text is written by the user (or pasted from a
 * web page): hostile by default. The chain is always
 *   marked (Markdown → HTML string)  →  DOMPurify (white list, DOM fragment)
 * and the fragment is appended as nodes: no `innerHTML` anywhere. Never sanitise BEFORE marked:
 * marked produces the HTML, DOMPurify must see the final string.
 *
 * Allowed: p br strong em ul ol li code pre blockquote h1-h4 a hr del and disabled checkboxes
 * (task lists, display only). Never: script, style, iframe, img (the images of a todo come from
 * Storage, never from the text), any on* attribute, any address other than http(s). Raw HTML
 * written in the text is shown as text; a remote image `![](http://…)` is replaced by its
 * alternative text (no tracking pixel, no remote content).
 *
 * This module has its own DOMPurify instance, so its hooks never touch the chat's.
 */
import DOMPurify from "dompurify";
import { Marked } from "marked";

export const BALISES_AUTORISEES = [
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "a",
  "hr",
  "del",
  "input",
];

const echapper = (texte) =>
  String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    // Raw HTML: shown as text, never interpreted.
    html: ({ text }) => echapper(text),
    // No image: only its description is kept.
    image: ({ text }) => echapper(text),
    heading({ tokens, depth }) {
      const niveau = Math.min(depth, 4);
      return `<h${niveau}>${this.parser.parseInline(tokens)}</h${niveau}>\n`;
    },
  },
});

let purify = null;
/** One instance for this module (created on first use, when a DOM exists). */
function instance() {
  if (purify) return purify;
  purify = typeof DOMPurify === "function" && globalThis.window ? DOMPurify(globalThis.window) : DOMPurify;
  purify.addHook("afterSanitizeAttributes", (noeud) => {
    if (noeud.tagName === "A") {
      let url = null;
      try {
        url = new URL(noeud.getAttribute("href") ?? "");
      } catch {
        /* no valid address */
      }
      if (!url || !/^https?:$/i.test(url.protocol)) {
        noeud.removeAttribute("href");
        return;
      }
      noeud.setAttribute("target", "_blank");
      noeud.setAttribute("rel", "noopener noreferrer");
    } else if (noeud.tagName === "INPUT") {
      // Only the checkbox of a task list, never interactive.
      if (noeud.getAttribute("type") !== "checkbox") {
        noeud.remove();
        return;
      }
      noeud.setAttribute("disabled", "");
      noeud.removeAttribute("name");
      noeud.removeAttribute("value");
    }
  });
  return purify;
}

/**
 * @param {string} markdown text written by the user
 * @returns {DocumentFragment} sanitised nodes, to append where the preview is shown
 */
export function rendreMarkdown(markdown) {
  const texte = String(markdown ?? "");
  const p = instance();
  // Without a usable DOM, DOMPurify would hand the string back untouched: show plain text.
  if (!p.isSupported) {
    const brut = document.createDocumentFragment();
    brut.append(document.createTextNode(texte));
    return brut;
  }
  return p.sanitize(marked.parse(texte), {
    ALLOWED_TAGS: BALISES_AUTORISEES,
    ALLOWED_ATTR: ["href", "type", "checked", "disabled"],
    ALLOW_DATA_ATTR: false,
    // `type` is not an address: without this the strict address test below would drop it.
    ADD_URI_SAFE_ATTR: ["type"],
    ALLOWED_URI_REGEXP: /^https?:/i,
    RETURN_DOM_FRAGMENT: true,
  });
}

/**
 * The four buttons of the editor, as a pure function of the text and the selection.
 * @param {string} valeur whole text
 * @param {number} debut start of the selection
 * @param {number} fin end of the selection
 * @param {"gras"|"italique"|"liste"|"case"} outil
 * @returns {{ valeur: string, debut: number, fin: number }}
 */
export function outilMarkdown(valeur, debut, fin, outil) {
  const avant = valeur.slice(0, debut);
  const selection = valeur.slice(debut, fin);
  const apres = valeur.slice(fin);
  if (outil === "gras" || outil === "italique") {
    const m = outil === "gras" ? "**" : "*";
    // Already wrapped: take the marks off.
    if (avant.endsWith(m) && apres.startsWith(m) && selection) {
      return {
        valeur: avant.slice(0, -m.length) + selection + apres.slice(m.length),
        debut: debut - m.length,
        fin: fin - m.length,
      };
    }
    return {
      valeur: avant + m + selection + m + apres,
      debut: debut + m.length,
      fin: fin + m.length,
    };
  }
  // A list: the prefix goes at the start of every line touched by the selection.
  const prefixe = outil === "case" ? "- [ ] " : "- ";
  const debutLigne = avant.lastIndexOf("\n") + 1;
  const bloc = valeur.slice(debutLigne, fin);
  const lignes = bloc.split("\n");
  const nouvelles = lignes.map((l) => (l.startsWith(prefixe) ? l.slice(prefixe.length) : prefixe + l));
  const retire = lignes.every((l) => l.startsWith(prefixe));
  const decalage = (retire ? -1 : 1) * prefixe.length;
  return {
    valeur: valeur.slice(0, debutLigne) + nouvelles.join("\n") + apres,
    debut: Math.max(debutLigne, debut + decalage),
    fin: fin + decalage * lignes.length,
  };
}
