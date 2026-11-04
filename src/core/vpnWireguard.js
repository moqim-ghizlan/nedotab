/**
 * V5.8: pure helpers of the WireGuard screen (no DOM, no network). A client configuration holds a
 * PRIVATE KEY: it is treated like a password and never stored by the application.
 */

/** The configuration on screen disappears after this delay. */
export const DUREE_QR_MS = 60_000;
export const URL_INSTALLATION = "https://www.wireguard.com/install/";
export const URL_ECHO = "https://www.cloudflare.com/cdn-cgi/trace";

export const AVERTISSEMENT_QR =
  "Ce code donne accès au VPN. Ne le montrez à personne et ne le prenez pas en photo.";
export const AVERTISSEMENT_FICHIER =
  "Ce fichier donne accès au VPN. Ne le partagez avec personne et supprimez-le une fois importé dans l'app WireGuard.";
export const NOTE_DOUBLE_VPN =
  "Avec WireGuard actif, tout votre appareil passe par le serveur (applications comprises). Pas besoin d'activer en plus le VPN de l'extension : si les deux sont actifs, ça fonctionne, mais le trafic de Chrome fait un détour inutile.";

/** What the screen keeps of the server's answer; anything else is dropped. null when malformed. */
export function lireProfil(donnees) {
  const d = donnees ?? {};
  if (typeof d.config !== "string" || !/^\[Interface\]/m.test(d.config)) return null;
  if (typeof d.nomProfil !== "string" || !/^p_[a-z0-9]{10}$/.test(d.nomProfil)) return null;
  return {
    config: d.config,
    nomProfil: d.nomProfil,
    pays: typeof d.pays === "string" ? d.pays : null,
  };
}

/** File name given to the system: "p_xxxxxxxxxx.conf" (the profile name, never the e-mail). */
export const nomFichierConf = (nomProfil) => `${nomProfil}.conf`;

/**
 * Pixels (RGBA) of a QR code: black modules on white, with a quiet zone of `marge` modules.
 * `modules` is { size, data } (data[i] truthy = dark). The width is at least `minimum` pixels,
 * so that the code can be scanned from 30 cm.
 */
export function matriceVersImage({ size, data }, { minimum = 280, marge = 4 } = {}) {
  const total = size + 2 * marge;
  const echelle = Math.max(1, Math.ceil(minimum / total));
  const largeur = total * echelle;
  const pixels = new Uint8ClampedArray(largeur * largeur * 4).fill(255);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!data[y * size + x]) continue;
      for (let dy = 0; dy < echelle; dy += 1) {
        for (let dx = 0; dx < echelle; dx += 1) {
          const i = (((y + marge) * echelle + dy) * largeur + (x + marge) * echelle + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    }
  }
  return { data: pixels, width: largeur, height: largeur };
}
