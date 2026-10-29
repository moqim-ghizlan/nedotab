/**
 * Google Gemini adapter. Official API (ai.google.dev, checked on the docs):
 * POST https://generativelanguage.googleapis.com/v1beta/models/{modele}:generateContent and
 * GET https://generativelanguage.googleapis.com/v1beta/models (key check), the key in the
 * "x-goog-api-key" header (never in the URL, which could end up in a log). Roles are "user"
 * and "model"; the system prompt is `systemInstruction`; JSON mode is
 * `generationConfig.responseMimeType`.
 */
import { analyserSse, appelJson, codeErreur, ErreurFournisseur } from "./commun.js";

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

/** Body of a generation request, the same for the full answer and for the stream. */
function corpsRequete({ systeme, messages, maxJetons, temperature, formatJson }) {
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
  return corps;
}

/** @type {import("./commun.js").Fournisseur["envoyer"]} */
export async function envoyer({ cle, modele, ...demande }, options) {
  const corps = corpsRequete(demande);
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

export const DELAI_FLUX_MS = 90000;

/**
 * V4.12: the answer as it is generated (":streamGenerateContent?alt=sse", official API).
 * Yields { type: "texte", delta }, then { type: "fin", jetonsEntree, jetonsSortie, raisonArret,
 * modele }, or { type: "erreur", code } when the provider fails in the middle. `signal`
 * cancels the HTTP request to the provider (the tokens stop being spent); a cancelled
 * generation simply ends. An error before the first byte is thrown (common error codes).
 * @param {{ cle: string, modele: string, systeme?: string, messages: object[], maxJetons?: number,
 *   temperature?: number, signal?: AbortSignal }} params
 * @param {{ fetch?: typeof fetch, delai?: number }} [options]
 */
export async function* envoyerFlux(
  { cle, modele, signal, ...demande },
  { fetch: f = globalThis.fetch, delai = DELAI_FLUX_MS } = {},
) {
  const arret = AbortSignal.any([AbortSignal.timeout(delai), ...(signal ? [signal] : [])]);
  let reponse;
  try {
    reponse = await f(
      `${BASE}/models/${encodeURIComponent(nomModele(modele))}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: entetes(cle),
        body: JSON.stringify(corpsRequete(demande)),
        signal: arret,
      },
    );
  } catch {
    if (signal?.aborted) return;
    throw new ErreurFournisseur("fournisseur-indisponible");
  }
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null);
    throw new ErreurFournisseur(codeErreur(reponse.status, corps), reponse.status);
  }
  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let raisonArret = null;
  let retour = nomModele(modele);
  let blocage = null;
  let texte = false;
  try {
    for await (const donnee of analyserSse(reponse.body)) {
      let m;
      try {
        m = JSON.parse(donnee);
      } catch {
        continue; // an event that is not JSON: ignored
      }
      if (m?.error) {
        yield { type: "erreur", code: codeErreur(Number(m.error.code) || 500, { error: m.error }) };
        return;
      }
      for (const p of m?.candidates?.[0]?.content?.parts ?? []) {
        if (typeof p.text === "string" && p.text) {
          texte = true;
          yield { type: "texte", delta: p.text };
        }
      }
      raisonArret = m?.candidates?.[0]?.finishReason ?? raisonArret;
      blocage = m?.promptFeedback?.blockReason ?? blocage;
      jetonsEntree = m?.usageMetadata?.promptTokenCount ?? jetonsEntree;
      jetonsSortie = m?.usageMetadata?.candidatesTokenCount ?? jetonsSortie;
      retour = m?.modelVersion ?? retour;
    }
  } catch {
    if (signal?.aborted) return;
    yield { type: "erreur", code: "fournisseur-indisponible" };
    return;
  }
  if (signal?.aborted) return;
  if (!texte) {
    yield { type: "erreur", code: blocage ? "requete-invalide" : "fournisseur-indisponible" };
    return;
  }
  yield { type: "fin", jetonsEntree, jetonsSortie, raisonArret, modele: retour };
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
