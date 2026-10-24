/** Letter badge colours: 12 hues readable with white text (contrast >= 4.5:1). */
export const PALETTE = [
  "#2c6b5a",
  "#1f6f8b",
  "#3a5ba0",
  "#5b4ea8",
  "#7d3f98",
  "#9c3b6e",
  "#a33a3a",
  "#a2501c",
  "#7a5c12",
  "#4f6b1f",
  "#2f6e3b",
  "#4a5560",
];

/** djb2 hash, stable across runs and platforms. */
export function hacher(texte) {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) >>> 0;
  return h;
}

function domaineDe(texte) {
  try {
    return new URL(texte.includes("://") ? texte : `https://${texte}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return texte;
  }
}

export function couleurDepuisTexte(texte) {
  const cle = domaineDe(
    String(texte ?? "")
      .trim()
      .toLowerCase(),
  );
  return PALETTE[hacher(cle) % PALETTE.length];
}

/** First alphanumeric character of the title, else of the domain, upper-cased; "?" otherwise. */
export function lettrePourSite(site) {
  const trouver = (t) => {
    const m = String(t ?? "").match(/[\p{L}\p{N}]/u);
    return m ? m[0].toLocaleUpperCase("fr") : null;
  };
  return trouver(site?.titre) ?? trouver(site?.url ? domaineDe(site.url) : "") ?? "?";
}

function canaux(hex) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (WCAG 2), 0 for black to 1 for white. */
export function luminance(hex) {
  const [r, g, b] = canaux(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contraste(a, b) {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

export const TEXTE_SUR_CLAIR = "#14201a";
export const TEXTE_SUR_SOMBRE = "#ffffff";

/** True when dark text reads better than white text on `hex`. */
export function estClaire(hex) {
  return contraste(hex, TEXTE_SUR_CLAIR) >= contraste(hex, TEXTE_SUR_SOMBRE);
}

/** Average of several hex colours (used for gradients). */
export function moyenne(couleurs) {
  const somme = [0, 0, 0];
  for (const c of couleurs) canaux(c).forEach((v, i) => (somme[i] += v));
  return `#${somme
    .map((v) =>
      Math.round(v / couleurs.length)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
