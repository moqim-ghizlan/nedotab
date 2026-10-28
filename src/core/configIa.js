/**
 * config/ia as the browser uses it (V4.1): providers offered (the model is imposed by the
 * server, the browser never chooses it). A missing document gives the
 * default below, so the screen works before the owner has written anything.
 */
export const CONFIG_IA_PAR_DEFAUT = {
  fournisseurs: [
    {
      id: "gemini",
      nom: "Google (Gemini)",
      lienCle: "https://aistudio.google.com/apikey",
      actif: true,
    },
  ],
};

const texte = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const lien = (v) => (typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) ? v : null);

/** @returns {{ fournisseurs: Array<{id, nom, lienCle, actif}> }} */
export function normaliserConfigIa(brut) {
  const fournisseurs = (Array.isArray(brut?.fournisseurs) ? brut.fournisseurs : [])
    .map((f) => ({
      id: texte(f?.id, 30),
      nom: texte(f?.nom, 60),
      lienCle: lien(f?.lienCle),
      actif: f?.actif === true,
    }))
    .filter((f) => f.id && f.nom);
  const liste = fournisseurs.length ? fournisseurs : CONFIG_IA_PAR_DEFAUT.fournisseurs;
  return { fournisseurs: liste };
}
