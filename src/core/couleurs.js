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
