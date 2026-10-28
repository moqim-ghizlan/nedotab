/**
 * Safe download of a web page for the server (V4.5). EVERY server feature that follows a
 * URL given by a user goes through here, never through a direct fetch.
 *
 * Rules: http/https only, ports 80 and 443 only, DNS resolved BEFORE connecting and every
 * address checked, connection made to the verified address (no DNS rebinding), redirections
 * followed by hand (3 at most, each one checked again), 6 s in all, 512 KB read at most, HTML
 * only, no cookie and no credentials, and the privacy exclusions of V4.3.
 */
import { Buffer } from "node:buffer";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { analyserConfidentialite } from "../partage/confidentialiteUrl.js";
import { adresseInterdite, estAdresseIp, nomInterdit } from "./ipInterdite.js";

export const DELAI_MS = 6000;
export const TAILLE_MAX = 512 * 1024;
export const REDIRECTIONS_MAX = 3;
export const USER_AGENT =
  "NedoTabBot/1.0 (+https://nedotab.web.app; reads a page its owner added to their own start page)";

export class ErreurPage extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Checks a URL and resolves its host: returns the URL object and the address to use. */
async function verifier(adresse, resoudre) {
  let url;
  try {
    url = new URL(adresse);
  } catch {
    throw new ErreurPage("adresse-interdite");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new ErreurPage("adresse-interdite");
  if (url.username || url.password) throw new ErreurPage("adresse-interdite");
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new ErreurPage("adresse-interdite");
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  if (estAdresseIp(hote)) {
    if (adresseInterdite(hote)) throw new ErreurPage("adresse-interdite");
    return { url, adresse: hote, famille: hote.includes(":") ? 6 : 4 };
  }
  if (nomInterdit(hote)) throw new ErreurPage("adresse-interdite");
  let adresses;
  try {
    adresses = await resoudre(hote);
  } catch {
    throw new ErreurPage("introuvable");
  }
  if (!adresses?.length) throw new ErreurPage("introuvable");
  // One forbidden address among the answers is enough to refuse (public + private mix).
  if (adresses.some((a) => adresseInterdite(a.address))) throw new ErreurPage("adresse-interdite");
  return { url, adresse: adresses[0].address, famille: adresses[0].family };
}

const resoudreDns = (hote) => dns.lookup(hote, { all: true });
const ouvrirReel = (protocole, options) => (protocole === "https:" ? https : http).request(options);

function decoder(octets, typeContenu) {
  let charset = /charset=["']?([\w-]+)/i.exec(typeContenu || "")?.[1];
  if (!charset) {
    const debut = new TextDecoder("latin1").decode(octets.subarray(0, 2048));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(debut)?.[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(octets);
  } catch {
    return new TextDecoder("utf-8").decode(octets);
  }
}

/** One request to a verified address; resolves with { statut, entetes, corps }. */
function demander({ url, adresse, famille }, ouvrir, signal) {
  return new Promise((resolve, reject) => {
    const req = ouvrir(url.protocol, {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-encoding": "identity" },
      agent: false,
      servername: estAdresseIp(url.hostname) ? undefined : url.hostname,
      // The connection goes to the address already verified, whatever the name now resolves to.
      lookup: (_h, options, cb) =>
        options?.all
          ? cb(null, [{ address: adresse, family: famille }])
          : cb(null, adresse, famille),
    });
    const fin = (e) => {
      req.destroy();
      reject(e);
    };
    signal.addEventListener("abort", () => fin(new ErreurPage("delai-depasse")), { once: true });
    req.on("error", (e) => fin(e instanceof ErreurPage ? e : new ErreurPage("inaccessible")));
    req.on("response", (rep) => {
      const entetes = rep.headers;
      if (rep.statusCode >= 300 && rep.statusCode < 400) {
        rep.resume();
        resolve({ statut: rep.statusCode, entetes, corps: null });
        return;
      }
      const type = String(entetes["content-type"] ?? "");
      if (!/^text\/html|^application\/xhtml\+xml/i.test(type)) {
        fin(new ErreurPage("type-invalide"));
        return;
      }
      const morceaux = [];
      let total = 0;
      const rendre = () =>
        resolve({ statut: rep.statusCode, entetes, corps: Buffer.concat(morceaux) });
      rep.on("data", (m) => {
        const reste = TAILLE_MAX - total;
        morceaux.push(m.subarray(0, reste));
        total += Math.min(m.length, reste);
        if (total >= TAILLE_MAX) {
          rep.destroy(); // stop the stream: 512 KB are enough
          rendre();
        }
      });
      rep.on("end", rendre);
      rep.on("error", rendre);
    });
    req.end();
  });
}

/**
 * @param {string} adresse
 * @param {{ resoudre?: Function, ouvrir?: Function, delaiMs?: number }} deps (tests only)
 * @returns {Promise<{ html: string, urlFinale: string }>}
 * @throws {ErreurPage} code: adresse-interdite | confidentialite | introuvable | inaccessible |
 *   type-invalide | trop-de-redirections | delai-depasse | statut-invalide
 */
export async function recupererPage(
  adresse,
  { resoudre = resoudreDns, ouvrir = ouvrirReel, delaiMs = DELAI_MS } = {},
) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    let courante = adresse;
    for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
      // Privacy exclusions (V4.3): nothing is downloaded for a sensitive or tokenised URL.
      const regle = analyserConfidentialite(courante);
      if (regle.raison === "invalide") throw new ErreurPage("adresse-interdite");
      if (!regle.contenu) throw new ErreurPage("confidentialite");
      const cible = await verifier(courante, resoudre);
      const r = await demander(cible, ouvrir, controleur.signal);
      if (r.corps === null) {
        const lieu = r.entetes.location;
        if (!lieu) throw new ErreurPage("statut-invalide");
        courante = new URL(lieu, cible.url).href;
        continue;
      }
      if (r.statut < 200 || r.statut >= 300) throw new ErreurPage("statut-invalide");
      return { html: decoder(r.corps, r.entetes["content-type"]), urlFinale: courante };
    }
    throw new ErreurPage("trop-de-redirections");
  } finally {
    clearTimeout(minuteur);
  }
}
