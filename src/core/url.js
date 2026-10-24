const SCHEMAS_REFUSES = {
  "javascript:": "Les adresses javascript: ne sont pas autorisées.",
  "data:": "Les adresses data: ne sont pas autorisées.",
  "file:": "Les fichiers locaux ne sont pas autorisés.",
  "chrome:": "Les pages internes de Chrome ne sont pas autorisées.",
  "chrome-extension:": "Les pages d'extension ne sont pas autorisées.",
  "about:": "Les pages about: ne sont pas autorisées.",
  "blob:": "Les adresses blob: ne sont pas autorisées.",
};

/**
 * Normalises a URL typed by the user.
 * @returns {{ ok: true, url: string } | { ok: false, erreur: string }}
 */
export function normaliserUrl(saisie) {
  const texte = String(saisie ?? "").trim();
  if (!texte) return { ok: false, erreur: "Saisissez une adresse." };
  if (/\s/.test(texte)) return { ok: false, erreur: "L'adresse ne doit pas contenir d'espace." };

  const schema = texte.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (schema && SCHEMAS_REFUSES[`${schema}:`])
    return { ok: false, erreur: SCHEMAS_REFUSES[`${schema}:`] };

  // "localhost:3000" or "exemple.com:8080" look like a scheme but are host:port.
  const aUnSchema = /^[a-z][a-z0-9+.-]*:\/\//i.test(texte);
  const candidat = aUnSchema ? texte : `https://${texte}`;
  let url;
  try {
    url = new URL(candidat);
  } catch {
    return { ok: false, erreur: "Cette adresse n'est pas valide." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, erreur: "Seules les adresses http et https sont acceptées." };
  }
  const hote = url.hostname.toLowerCase();
  if (!hote || (!hote.includes(".") && hote !== "localhost" && !hote.startsWith("["))) {
    return { ok: false, erreur: "Il manque le domaine (par exemple exemple.com)." };
  }
  let resultat = url.href;
  if (url.pathname === "/" && !url.search && !url.hash) resultat = resultat.replace(/\/$/, "");
  return { ok: true, url: resultat };
}

/** Key used to detect duplicates: no scheme, no "www.", no trailing slash, lower case. */
export function cleUrl(url) {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** Host without "www." (default title). */
export function domaine(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url ?? "");
  }
}

/**
 * The site's domain then its parent domains, down to two labels (icon lookup: Google's
 * service often knows "cloud.google.com" but not "console.cloud.google.com").
 * IP addresses and single-label hosts are returned alone.
 */
export function domainesParents(url) {
  const d = domaine(url);
  if (/^[\d.]+$/.test(d) || d.startsWith("[")) return [d];
  const etiquettes = d.split(".");
  const resultat = [];
  for (let i = 0; i <= etiquettes.length - 2; i++) resultat.push(etiquettes.slice(i).join("."));
  return resultat.length ? resultat : [d];
}
