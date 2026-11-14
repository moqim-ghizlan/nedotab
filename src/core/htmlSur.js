/**
 * Remote pages are only read (title, icons, text), never run. Parsing their HTML inside an
 * extension page makes Chrome report each inline handler (`onload="…"`, `onerror=…`) as a
 * Content-Security-Policy violation in the extension's error list. Removing the handler
 * attributes from the markup first keeps the parsed document identical for our needs.
 */
const GESTIONNAIRE = /(<[a-z][^>]*?)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

export function retirerGestionnaires(html) {
  if (typeof html !== "string") return "";
  let courant = html;
  let precedent;
  // Several handlers on one tag: repeat until none is left.
  do {
    precedent = courant;
    courant = courant.replace(GESTIONNAIRE, "$1");
  } while (courant !== precedent);
  return courant;
}
