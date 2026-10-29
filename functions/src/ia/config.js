/**
 * config/ia (V4.0): providers offered, the one model imposed, daily quota. Written by the owner
 * (console or functions/scripts/initialiser-config-ia.js), read by the functions and kept
 * 5 minutes in the instance. Model ids are never written in the code: they change often.
 */
import { QUOTA_MAX_PAR_DEFAUT, QUOTA_PAGES_PAR_DEFAUT, QUOTA_PAR_DEFAUT } from "../quota.js";

export const DUREE_CACHE_MS = 5 * 60 * 1000;

/**
 * Used until config/ia exists: Gemini only, one model for everybody (`modele`, the owner can
 * change it in config/ia without a deploy), 300 calls a day.
 */
export const CONFIG_PAR_DEFAUT = {
  quotaQuotidien: QUOTA_PAR_DEFAUT,
  // Highest daily limit a user may choose for themselves (V4.7).
  quotaMax: QUOTA_MAX_PAR_DEFAUT,
  // Page downloads a day for the web app (V4.5), apart from the AI calls.
  quotaPages: QUOTA_PAGES_PAR_DEFAUT,
  modele: "gemini-3.1-flash-lite",
  fournisseurs: [
    {
      id: "gemini",
      nom: "Google (Gemini)",
      lienCle: "https://aistudio.google.com/apikey",
      actif: true,
    },
  ],
};

/** The config with every field present and of the right type. */
export function normaliserConfig(brute) {
  const c = brute ?? {};
  const quota =
    Number.isInteger(c.quotaQuotidien) && c.quotaQuotidien > 0 ? c.quotaQuotidien : null;
  return {
    quotaQuotidien: quota ?? CONFIG_PAR_DEFAUT.quotaQuotidien,
    quotaPages:
      Number.isInteger(c.quotaPages) && c.quotaPages > 0
        ? c.quotaPages
        : CONFIG_PAR_DEFAUT.quotaPages,
    quotaMax:
      Number.isInteger(c.quotaMax) && c.quotaMax > 0 ? c.quotaMax : CONFIG_PAR_DEFAUT.quotaMax,
    modele:
      typeof c.modele === "string" && /^[\w.:/-]{1,100}$/.test(c.modele)
        ? c.modele
        : CONFIG_PAR_DEFAUT.modele,
    fournisseurs: Array.isArray(c.fournisseurs) ? c.fournisseurs : CONFIG_PAR_DEFAUT.fournisseurs,
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
