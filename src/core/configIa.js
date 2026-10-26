/**
 * config/ia as the browser uses it (V4.1): providers offered, models suggested by the
 * owner (their ids are never in the code: they change often). A missing document gives the
 * default below, so the screen works before the owner has written anything.
 */
export const CONFIG_IA_PAR_DEFAUT = {
  fournisseurs: [
    {
      id: "openai",
      nom: "OpenAI (GPT)",
      lienCle: "https://platform.openai.com/api-keys",
      actif: true,
    },
    {
      id: "gemini",
      nom: "Google (Gemini)",
      lienCle: "https://aistudio.google.com/apikey",
      actif: true,
    },
  ],
  modelesSuggeres: [],
};

const ID = /^[A-Za-z0-9._:/@-]{1,100}$/;
const texte = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const lien = (v) => (typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) ? v : null);

/** @returns {{ fournisseurs: Array<{id, nom, lienCle, actif}>, modelesSuggeres: Array }} */
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
  const modelesSuggeres = (Array.isArray(brut?.modelesSuggeres) ? brut.modelesSuggeres : [])
    .filter(
      (m) =>
        liste.some((f) => f.id === m?.fournisseur) && typeof m?.id === "string" && ID.test(m.id),
    )
    .map((m) => ({
      fournisseur: m.fournisseur,
      id: m.id,
      nom: texte(m.nom, 60) ?? m.id,
      usages: Array.isArray(m.usages) ? m.usages.filter((u) => typeof u === "string") : [],
      recommandePour: typeof m.recommandePour === "string" ? m.recommandePour : null,
    }));
  return { fournisseurs: liste, modelesSuggeres };
}
