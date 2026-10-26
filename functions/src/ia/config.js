/**
 * config/ia (V4.0): providers offered, suggested models, daily quota. Written by the owner
 * (console or functions/scripts/initialiser-config-ia.js), read by the functions and kept
 * 5 minutes in the instance. Model ids are never written in the code: they change often.
 */
import { QUOTA_PAR_DEFAUT } from "../quota.js";

export const DUREE_CACHE_MS = 5 * 60 * 1000;

/** Used until config/ia exists: OpenAI and Gemini (the providers chosen), 300 calls a day. */
export const CONFIG_PAR_DEFAUT = {
  quotaQuotidien: QUOTA_PAR_DEFAUT,
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

/** The config with every field present and of the right type. */
export function normaliserConfig(brute) {
  const c = brute ?? {};
  const quota =
    Number.isInteger(c.quotaQuotidien) && c.quotaQuotidien > 0 ? c.quotaQuotidien : null;
  return {
    quotaQuotidien: quota ?? CONFIG_PAR_DEFAUT.quotaQuotidien,
    fournisseurs: Array.isArray(c.fournisseurs) ? c.fournisseurs : CONFIG_PAR_DEFAUT.fournisseurs,
    modelesSuggeres: Array.isArray(c.modelesSuggeres) ? c.modelesSuggeres : [],
  };
}

/** Ids of the providers the users can choose now. */
export const fournisseursActifs = (config) =>
  config.fournisseurs.filter((f) => f.actif).map((f) => f.id);

/** @param {{ doc: (chemin: string) => { get: () => Promise<any> } }} db */
export function creerLecteurConfig(db, { horloge = () => Date.now() } = {}) {
  let cache = null;
  return async () => {
    if (cache && horloge() - cache.le < DUREE_CACHE_MS) return cache.config;
    const snap = await db.doc("config/ia").get();
    cache = { le: horloge(), config: normaliserConfig(snap.exists ? snap.data() : null) };
    return cache.config;
  };
}
