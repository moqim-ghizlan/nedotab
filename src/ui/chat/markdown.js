/**
 * Safe Markdown of the chat answers (V4.11, docs/securite.md).
 *
 * The answers of the model are untrusted. This is the ONLY place of the project where content
 * becomes HTML, and never without going through DOMPurify with a strict white list:
 *   marked (Markdown → HTML string)  →  DOMPurify (white list, returns a DOM fragment)
 * The fragment is appended as nodes: there is no `innerHTML` anywhere. Raw HTML written by
 * the model is shown as text, images are never rendered (tracking, unwanted content), links
 * only keep http(s), open in a new tab with `noopener noreferrer`, and show their domain on
 * hover.
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
  "a",
  "h3",
  "h4",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
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
    // Raw HTML of the model: shown as text, never interpreted.
    html: ({ text }) => echapper(text),
    // No image: only its description is kept.
    image: ({ text }) => echapper(text),
    // The window is narrow: only two levels of title.
    heading({ tokens, depth }) {
      const niveau = depth <= 3 ? 3 : 4;
      return `<h${niveau}>${this.parser.parseInline(tokens)}</h${niveau}>\n`;
    },
  },
});

const PROTOCOLE_SUR = /^https?:$/i;

DOMPurify.addHook("afterSanitizeAttributes", (noeud) => {
  if (noeud.tagName !== "A") return;
  let url = null;
  try {
    url = new URL(noeud.getAttribute("href") ?? "");
  } catch {
    /* no valid address */
  }
  if (!url || !PROTOCOLE_SUR.test(url.protocol)) {
    noeud.removeAttribute("href");
    return;
  }
  noeud.setAttribute("target", "_blank");
  noeud.setAttribute("rel", "noopener noreferrer");
  noeud.setAttribute("title", url.hostname.replace(/^www\./, ""));
});

/**
 * @param {string} markdown text of an answer
 * @returns {DocumentFragment} sanitised nodes, to append to the bubble
 */
export function rendreMarkdown(markdown) {
  // Without a usable DOM, DOMPurify would hand the string back untouched: show plain text.
  if (!DOMPurify.isSupported) {
    const texte = document.createDocumentFragment();
    texte.append(document.createTextNode(String(markdown ?? "")));
    return texte;
  }
  const html = marked.parse(String(markdown ?? ""));
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: BALISES_AUTORISEES,
    ALLOWED_ATTR: ["href"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^https?:/i,
    RETURN_DOM_FRAGMENT: true,
  });
  // A wide table scrolls inside itself, never the whole window.
  for (const tableau of [...fragment.querySelectorAll("table")]) {
    const boite = document.createElement("div");
    boite.className = "chat-tableau";
    tableau.replaceWith(boite);
    boite.append(tableau);
  }
  return fragment;
}
