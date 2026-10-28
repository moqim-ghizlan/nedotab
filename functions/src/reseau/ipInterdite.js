/**
 * Which addresses the server may connect to on behalf of a user (V4.5, anti-SSRF).
 * An address is classified by a proven library (ipaddr.js), never by comparing text: only
 * public unicast addresses pass. Everything else (private, loopback, link-local such as the
 * metadata address 169.254.169.254, carrier-grade NAT, reserved, multicast…) is refused.
 */
import ipaddr from "ipaddr.js";

const NOMS_INTERDITS = ["localhost", "metadata.google.internal"];
const SUFFIXES_INTERDITS = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

/** Ranges the library may call "unicast" or not list, but the plan forbids. */
const PLAGES_SUPPLEMENTAIRES = ["192.0.0.0/24", "198.18.0.0/15", "100.64.0.0/10"].map((c) =>
  ipaddr.parseCIDR(c),
);

/** True when `adresse` (text of an IPv4 or IPv6) must not be reached. Unreadable: refused. */
export function adresseInterdite(adresse) {
  let ip;
  try {
    ip = ipaddr.parse(String(adresse).replace(/^\[|\]$/g, ""));
  } catch {
    return true;
  }
  if (ip.kind() === "ipv6" && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
  if (ip.kind() === "ipv4" && PLAGES_SUPPLEMENTAIRES.some((p) => ip.match(p))) return true;
  return ip.range() !== "unicast";
}

/** True when the host NAME (not yet resolved) is one of the forbidden names. */
export function nomInterdit(hote) {
  const h = String(hote ?? "")
    .toLowerCase()
    .replace(/\.$/, "");
  return !h || NOMS_INTERDITS.includes(h) || SUFFIXES_INTERDITS.some((s) => h.endsWith(s));
}

/** Is the host a literal IP address (after URL normalisation: 0x7f000001 becomes 127.0.0.1)? */
export const estAdresseIp = (hote) => ipaddr.isValid(String(hote).replace(/^\[|\]$/g, ""));
