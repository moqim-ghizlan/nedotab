/**
 * V5.5: pure analysis of WebRTC (ICE) candidates, to see whether a site could learn the real
 * public address through a side channel. No DOM, no chrome.*.
 */

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Address of a candidate line ("candidate:… udp 2122… 192.168.1.5 54321 typ host …"). */
export function adresseDuCandidat(ligne) {
  const champs = String(ligne ?? "")
    .replace(/^a=/, "")
    .trim()
    .split(/\s+/);
  return champs[0]?.startsWith("candidate:") ? (champs[4] ?? null) : null;
}

/** "mdns" (xxxx.local, hidden by the browser), "locale", "publique" or null (not an address). */
export function genreAdresse(adresse) {
  if (!adresse) return null;
  if (adresse.endsWith(".local")) return "mdns";
  const m = V4.exec(adresse);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 255 || b > 255) return null;
    if (a === 10 || a === 127 || a === 0) return "locale";
    if (a === 172 && b >= 16 && b <= 31) return "locale";
    if (a === 192 && b === 168) return "locale";
    if (a === 169 && b === 254) return "locale";
    if (a === 100 && b >= 64 && b <= 127) return "locale";
    return "publique";
  }
  if (adresse.includes(":")) {
    const a = adresse.toLowerCase();
    if (a === "::1" || a.startsWith("fe80") || /^f[cd]/.test(a)) return "locale";
    return "publique";
  }
  return null;
}

const memeAdresse = (a, b) => !!b && a.toLowerCase() === String(b).toLowerCase();

/**
 * @param {string[]} candidats  ICE candidate lines
 * @param {{ ipServeur?: string|null, ipVue?: string|null }} connues  addresses that are allowed
 * @returns {{ fuite: boolean, publiques: string[], locales: string[], problemes: string[] }}
 */
export function analyserCandidats(candidats, { ipServeur = null, ipVue = null } = {}) {
  const publiques = new Set();
  const locales = new Set();
  for (const ligne of candidats ?? []) {
    const adresse = adresseDuCandidat(ligne);
    const genre = genreAdresse(adresse);
    if (genre === "publique" && !memeAdresse(adresse, ipServeur) && !memeAdresse(adresse, ipVue))
      publiques.add(adresse);
    else if (genre === "locale") locales.add(adresse);
  }
  const problemes = [];
  if (publiques.size)
    problemes.push(
      `WebRTC laisse voir une adresse publique autre que celle du serveur : ${[...publiques].join(", ")}.`,
    );
  if (locales.size)
    problemes.push(
      `Une adresse locale est visible (${[...locales].join(", ")}) : elle n'est pas masquée par le navigateur.`,
    );
  return {
    fuite: publiques.size > 0,
    publiques: [...publiques],
    locales: [...locales],
    problemes,
  };
}
