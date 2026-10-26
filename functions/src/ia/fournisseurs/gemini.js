/**
 * Google Gemini adapter. Official API (ai.google.dev, checked on the docs):
 * POST https://generativelanguage.googleapis.com/v1beta/models/{modele}:generateContent and
 * GET https://generativelanguage.googleapis.com/v1beta/models, the key in the
 * "x-goog-api-key" header (never in the URL, which could end up in a log). Roles are "user"
 * and "model"; the system prompt is `systemInstruction`; JSON mode is
 * `generationConfig.responseMimeType`.
 */
import { appelJson, ErreurFournisseur } from "./commun.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const entetes = (cle) => ({ "x-goog-api-key": cle, "content-type": "application/json" });

/**
 * Very loose on purpose: Google has changed the look of its keys (older "AIza…", newer ones
 * with other characters such as a dot). The test call decides; this only stops obvious
 * mistakes (spaces, a pasted sentence).
 */
export const formatCle = /^[\w.~+/=-]{20,}$/;

/** "models/xxx" and "xxx" both work for the user. */
const nomModele = (modele) => modele.replace(/^models\//, "");

/** @type {import("./commun.js").Fournisseur["envoyer"]} */
export async function envoyer(
  { cle, modele, systeme, messages, maxJetons, temperature, formatJson },
  options,
) {
  const config = {
    ...(maxJetons ? { maxOutputTokens: maxJetons } : {}),
    ...(temperature != null ? { temperature } : {}),
    ...(formatJson ? { responseMimeType: "application/json" } : {}),
  };
  const corps = {
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.texte }],
    })),
    ...(systeme ? { systemInstruction: { parts: [{ text: systeme }] } } : {}),
    ...(Object.keys(config).length ? { generationConfig: config } : {}),
  };
  const r = await appelJson(
    `${BASE}/models/${encodeURIComponent(nomModele(modele))}:generateContent`,
    { method: "POST", headers: entetes(cle), body: JSON.stringify(corps) },
    options,
  );
  // A prompt blocked by the provider has no candidate.
  const texte = (r?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
  if (!texte)
    throw new ErreurFournisseur(
      r?.promptFeedback?.blockReason ? "requete-invalide" : "fournisseur-indisponible",
    );
  return {
    texte,
    jetonsEntree: r.usageMetadata?.promptTokenCount ?? 0,
    jetonsSortie: r.usageMetadata?.candidatesTokenCount ?? 0,
    modele: r.modelVersion ?? nomModele(modele),
  };
}

/** Lists the models: free, refused (400 API_KEY_INVALID or 403) when the key is wrong. */
export async function verifierCle({ cle }, options) {
  try {
    await appelJson(`${BASE}/models?pageSize=1`, { method: "GET", headers: entetes(cle) }, options);
    return { valide: true };
  } catch (e) {
    if (e instanceof ErreurFournisseur && e.code !== "fournisseur-indisponible")
      return { valide: false, raison: e.code };
    throw e;
  }
}

/**
 * Models the key can use to write text (GET /v1beta/models: those that support
 * generateContent), sorted by identifier. The list comes from Google at the time of the
 * call: nothing about models is written in the code.
 * @returns {Promise<Array<{ id: string, nom: string }>>}
 */
export async function listerModeles({ cle }, options) {
  const r = await appelJson(
    `${BASE}/models?pageSize=1000`,
    { method: "GET", headers: entetes(cle) },
    options,
  );
  return (Array.isArray(r?.models) ? r.models : [])
    .filter((m) => m?.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({
      id: nomModele(String(m.name ?? "")),
      nom: m.displayName || nomModele(String(m.name)),
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}
