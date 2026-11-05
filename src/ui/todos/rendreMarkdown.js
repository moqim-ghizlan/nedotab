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
 * This module has its own DOMPurify instance, so its hooks never touch the chat's. It needs a
 * DOM (DOMPurify), so it lives in ui/ and not in the pure core/.
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

