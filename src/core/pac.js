/**
 * V5.6: generates the proxy script (PAC) of the per-site rules. Pure.
 *
 * Safety: every domain goes through the strict validation of domainesVpn.js and is then inserted
 * with JSON.stringify, never concatenated. The script never resolves a name (no dnsResolve, no
 * isResolvable); isInNet only runs on a literal IPv4 address, which needs no resolution.
 */
import { normaliserDomaine, sansRegle, validerReglesVpn } from "./domainesVpn.js";

/**
 * @returns {string|null} the script, or null when the rules need none (plain "all but nothing")
 *   or when the server is invalid: the caller then keeps the plain proxy.
 */
export function genererPac(regles, { domaine, port = 443 }) {
  const hote = normaliserDomaine(domaine);
  if (!hote || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (sansRegle(regles)) return null;
  const v = validerReglesVpn(regles);
  const liste = v.mode === "tout_sauf" ? v.exceptions : v.liste;
  const proxy = `HTTPS ${hote}:${port}`;
  const siListe = v.mode === "tout_sauf" ? "DIRECT" : proxy;
  const sinon = v.mode === "tout_sauf" ? proxy : "DIRECT";
  return `function FindProxyForURL(url, host) {
  var h = String(host).toLowerCase();
  var liste = ${JSON.stringify(liste)};
  if (isPlainHostName(h) || h === "localhost" || h === "[::1]") return "DIRECT";
  if (/^[0-9]{1,3}(\\.[0-9]{1,3}){3}$/.test(h)) {
    if (isInNet(h, "10.0.0.0", "255.0.0.0") || isInNet(h, "172.16.0.0", "255.240.0.0") ||
        isInNet(h, "192.168.0.0", "255.255.0.0") || isInNet(h, "127.0.0.0", "255.0.0.0")) return "DIRECT";
  }
  for (var i = 0; i < liste.length; i++) {
    if (h === liste[i] || dnsDomainIs(h, "." + liste[i])) return ${JSON.stringify(siListe)};
  }
  return ${JSON.stringify(sinon)};
}
`;
}

/** chrome.proxy value: the script when there are rules, else the plain fixed server. */
export function valeurProxy(regles, acces, configSimple) {
  const pac = genererPac(regles, acces);
  return pac
    ? { mode: "pac_script", pacScript: { data: pac, mandatory: true } }
    : configSimple(acces);
}
