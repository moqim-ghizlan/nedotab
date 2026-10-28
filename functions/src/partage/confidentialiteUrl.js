// Copy of src/core/confidentialiteUrl.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Privacy rules of the page reader (V4.3, docs/ia.md): which pages may have their content
 * read, and which URL may be passed on. Pure; never fetches.
 */

/** Host patterns whose content is never read (bank, health, mail…). Extended in V4.20. */
export const MOTIFS_SENSIBLES = [
  "bank",
  "banque",
  "mail.",
  "webmail",
  "health",
  "sante",
  "ameli",
  "impots",
  "paypal",
];

const SUFFIXES_PRIVES = [".local", ".internal", ".lan"];
const PARAMETRES_JETON = ["token", "key", "session", "auth", "code", "sig"];

function ipv4Privee(hote) {
  const m = hote.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

/** localhost, private IP addresses and local domain names. */
export function hotePrive(hote) {
  const h = String(hote ?? "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (SUFFIXES_PRIVES.some((s) => h.endsWith(s))) return true;
  if (ipv4Privee(h)) return true;
  // IPv6: loopback, unique local (fc00::/7), link-local (fe80::/10), mapped IPv4.
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    const mappee = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mappee ? ipv4Privee(mappee[1]) : false;
  }
  return false;
}

export const hoteSensible = (hote, motifs = MOTIFS_SENSIBLES) => {
  const h = String(hote ?? "").toLowerCase();
  return motifs.some((m) => h.includes(m));
};

function aParametreJeton(url) {
  for (const nom of url.searchParams.keys()) {
    const n = nom.toLowerCase();
    if (PARAMETRES_JETON.some((p) => n === p || n.includes(p))) return true;
  }
  return false;
}

/**
 * @returns {{ contenu: boolean, url: string, raison: string|null }} whether the content may
 *   be read, the URL to pass on (query removed when it looks like it holds a token) and why not.
 */
export function analyserConfidentialite(adresse, motifs = MOTIFS_SENSIBLES) {
  let url;
  try {
    url = new URL(adresse);
  } catch {
    return { contenu: false, url: String(adresse ?? ""), raison: "invalide" };
  }
  if (hotePrive(url.hostname)) return { contenu: false, url: url.href, raison: "prive" };
  if (aParametreJeton(url)) {
    url.search = "";
    url.hash = "";
    return { contenu: false, url: url.href, raison: "jeton" };
  }
  if (hoteSensible(url.hostname, motifs))
    return { contenu: false, url: url.href, raison: "sensible" };
  return { contenu: true, url: url.href, raison: null };
}
