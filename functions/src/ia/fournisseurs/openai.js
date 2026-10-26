/**
 * OpenAI adapter (V4.0, first provider). Official HTTP API (openai-openapi spec):
 * POST https://api.openai.com/v1/chat/completions, GET https://api.openai.com/v1/models,
 * key as "Authorization: Bearer". `max_completion_tokens` replaces the deprecated
 * `max_tokens`; `temperature` is only sent when asked (some models refuse it).
 */
import { appelJson, ErreurFournisseur } from "./commun.js";

const BASE = "https://api.openai.com/v1";

const entetes = (cle) => ({
  authorization: `Bearer ${cle}`,
  "content-type": "application/json",
});

/** Loose on purpose: the test call decides, the format only stops obvious mistakes. */
export const formatCle = /^sk-[A-Za-z0-9_-]{16,}$/;

/** @type {import("./commun.js").Fournisseur["envoyer"]} */
export async function envoyer(
  { cle, modele, systeme, messages, maxJetons, temperature, formatJson },
  options,
) {
  const corps = {
    model: modele,
    messages: [
      ...(systeme ? [{ role: "system", content: systeme }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.texte })),
    ],
    ...(maxJetons ? { max_completion_tokens: maxJetons } : {}),
    ...(temperature != null ? { temperature } : {}),
    ...(formatJson ? { response_format: { type: "json_object" } } : {}),
  };
  const r = await appelJson(
    `${BASE}/chat/completions`,
    { method: "POST", headers: entetes(cle), body: JSON.stringify(corps) },
    options,
  );
  const texte = r?.choices?.[0]?.message?.content;
  if (typeof texte !== "string") throw new ErreurFournisseur("fournisseur-indisponible");
  return {
    texte,
    jetonsEntree: r.usage?.prompt_tokens ?? 0,
    jetonsSortie: r.usage?.completion_tokens ?? 0,
    modele: r.model ?? modele,
  };
}

/** Lists the models: free, and refused with 401 when the key is wrong. */
export async function verifierCle({ cle }, options) {
  try {
    await appelJson(`${BASE}/models`, { method: "GET", headers: entetes(cle) }, options);
    return { valide: true };
  } catch (e) {
    if (e instanceof ErreurFournisseur && e.code !== "fournisseur-indisponible")
      return { valide: false, raison: e.code };
    throw e;
  }
}
