/**
 * Google Gemini adapter: the interface is here, implemented in V4.1.
 * Official API (ai.google.dev): POST
 * https://generativelanguage.googleapis.com/v1beta/models/{modele}:generateContent and
 * GET .../v1beta/models, the key in the "x-goog-api-key" header (never in the URL).
 */
export const formatCle = /^[A-Za-z0-9_-]{30,}$/;

/** @type {import("./commun.js").Fournisseur["envoyer"]} */
export async function envoyer() {
  throw new Error("non implémenté");
}

export async function verifierCle() {
  throw new Error("non implémenté");
}
