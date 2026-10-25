/**
 * Kind of device that wrote a backup (V3.3), only shown in the backups list: "extension"
 * (Chrome), "iphone", "ipad" or "navigateur" (the web app on a computer). "pwa" comes
 * from backups made before 3.3.0.
 */
export function typeAppareil(cible, nav = globalThis.navigator) {
  if (cible !== "pwa") return "extension";
  const ua = nav?.userAgent ?? "";
  if (/iphone|ipod/i.test(ua)) return "iphone";
  // Safari on iPad says "Macintosh": it is told apart by touch.
  if (/ipad/i.test(ua) || (/macintosh/i.test(ua) && nav?.maxTouchPoints > 1)) return "ipad";
  return "navigateur";
}

const LIBELLES = {
  extension: "Chrome",
  iphone: "iPhone",
  ipad: "iPad",
  navigateur: "Navigateur",
  pwa: "iPhone / iPad",
};

export const libelleAppareil = (type) => LIBELLES[type] ?? "Autre appareil";
