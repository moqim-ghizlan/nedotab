/**
 * V5.6: per-site rules of the VPN (pure). `reglages.vpn = { mode, exceptions, liste }`, synced.
 * The identifiers and the on/off state are NOT here: they stay on each device.
 */

export const LISTE_MAX = 200;
export const MODES = ["tout_sauf", "seulement"];

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * "HTTPS://WWW.Exemple.com:8080/page?x" → "www.exemple.com"; "*.exemple.com" → "exemple.com"
 * (a domain already covers its sub-domains). Returns null when it is not a valid domain.
 */
export function normaliserDomaine(entree) {
  if (typeof entree !== "string") return null;
  let s = entree.trim().toLowerCase();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/[/?#].*$/, "");
  s = s.replace(/^[^@]*@/, "").replace(/:\d{1,5}$/, "");
  s = s.replace(/^\*\./, "").replace(/\.$/, "");
  if (!s || s.includes("*")) return null;
  let ascii;
  try {
    ascii = new URL(`http://${s}`).hostname; // IDN → punycode
  } catch {
    return null;
  }
  const etiquettes = ascii.split(".");
  if (ascii.length > 253 || etiquettes.length < 1) return null;
  if (!etiquettes.every((e) => LABEL.test(e))) return null;
  return ascii;
}

/** Domain of an address of the grid ("https://www.exemple.com/a" → "www.exemple.com"). */
export function domaineDeUrl(url) {
  return normaliserDomaine(url);
}

/** A list made valid: normalised, unique, bounded; invalid entries dropped. */
export function validerListe(liste) {
  const vus = new Set();
  const resultat = [];
  for (const e of Array.isArray(liste) ? liste : []) {
    const d = normaliserDomaine(e);
    if (!d || vus.has(d)) continue;
    vus.add(d);
    resultat.push(d);
    if (resultat.length === LISTE_MAX) break;
  }
  return resultat;
}

export function validerReglesVpn(r) {
  const brut = r && typeof r === "object" ? r : {};
  return {
    mode: MODES.includes(brut.mode) ? brut.mode : "tout_sauf",
    exceptions: validerListe(brut.exceptions),
    liste: validerListe(brut.liste),
  };
}

/** Same, but undefined when everything is at its default (nothing is stored). */
export function reglesAStocker(r) {
  const v = validerReglesVpn(r);
  return v.mode === "tout_sauf" && !v.exceptions.length && !v.liste.length ? undefined : v;
}

export const reglesVpnDe = (reglages) => validerReglesVpn(reglages?.vpn);

/** Rules without any effect: "all but nothing" is the plain proxy (no script needed). */
export function sansRegle(r) {
  const v = validerReglesVpn(r);
  return v.mode === "tout_sauf" ? v.exceptions.length === 0 : false;
}

/** Does the domain (or one of its parents) belong to the list? */
export function couvre(liste, hote) {
  const h = normaliserDomaine(hote);
  if (!h) return false;
  return liste.some((d) => h === d || h.endsWith(`.${d}`));
}

/** How does this host travel with these rules? "vpn" or "direct". */
export function routeDe(r, hote) {
  const v = validerReglesVpn(r);
  if (v.mode === "tout_sauf") return couvre(v.exceptions, hote) ? "direct" : "vpn";
  return couvre(v.liste, hote) ? "vpn" : "direct";
}

/** Adds or removes a domain from the list the mode uses. Returns new rules. */
export function avecDomaine(r, domaine, route) {
  const v = validerReglesVpn(r);
  const d = normaliserDomaine(domaine);
  if (!d) return v;
  const cle = v.mode === "tout_sauf" ? "exceptions" : "liste";
  // In "all but": a site is direct when listed. In "only": it goes through the VPN when listed.
  const dansListe = v.mode === "tout_sauf" ? route === "direct" : route === "vpn";
  const base = v[cle].filter((x) => x !== d);
  return validerReglesVpn({ ...v, [cle]: dansListe ? [...base, d] : base });
}
