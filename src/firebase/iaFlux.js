import { httpsCallable } from "firebase/functions";
import { obtenirFonctions } from "./fonctions.js";

/**
 * Chat answer as it is generated (V4.12, docs/decisions.md: callable streaming).
 * Yields { type: "texte", delta }, then { type: "fin", modele } — or { type: "erreur", code }
 * when the provider fails in the middle. `signal` closes the stream: the server then cancels
 * the request to the provider. An error before the first byte is thrown, like `appelerIa`.
 * V4.15: the history is read by the server in the conversation (the browser sends only its id);
 * the end carries `messageId`, the id of the answer the server wrote in the conversation.
 * V4.20: with the history switched off, the browser sends the messages (memory mode).
 * @param {string|{ role: string, texte: string }[]} conversation the id, or the messages
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function* lireFluxChat(conversation, { signal } = {}) {
  const { stream, data } = await httpsCallable(obtenirFonctions(), "iaChatFlux").stream(
    donneesChat(conversation),
    { signal },
  );
  for await (const morceau of stream) yield morceau;
  const fin = await data;
  if (fin?.ok)
    yield {
      type: "fin",
      modele: fin.modele,
      sites: fin.sites,
      consulte: fin.consulte,
      messageId: fin.messageId,
    };
  // Stopped halfway: the text received is kept by the server, the panel learns its id.
  else if (fin?.messageId) yield { type: "enregistre", messageId: fin.messageId };
}

/** What the chat functions receive: the conversation id, or (history off) the messages. */
export const donneesChat = (conversation) =>
  typeof conversation === "string" ? { convId: conversation } : { messages: conversation };

/** Errors that mean "the stream could not be opened here" (network, proxy), not "refused". */
const CODES_OUVERTURE = new Set([
  "functions/unavailable",
  "functions/internal",
  "functions/unknown",
  "functions/deadline-exceeded",
  "functions/failed-precondition",
]);

/** True if the non-streamed answer may be asked instead (never after a known refusal). */
export function peutRepli(e) {
  if (!e || e.name === "AbortError" || e.details?.code) return false;
  return !e.code || CODES_OUVERTURE.has(e.code);
}

/**
 * The stream, or — when it cannot be opened before the first chunk — the whole answer of
 * `complet` given as one chunk. A stream that fails later is not retried (the text received
 * stays, the user decides).
 * @param {{ ouvrir: typeof lireFluxChat, complet: (messages: object[]) => Promise<{ texte: string, modele?: string }> }} acces
 */
export async function* fluxAvecRepli({ ouvrir, complet }, messages, { signal } = {}) {
  let recu = false;
  try {
    for await (const morceau of ouvrir(messages, { signal })) {
      recu = true;
      yield morceau;
    }
    return;
  } catch (e) {
    if (recu || signal?.aborted || !peutRepli(e)) throw e;
  }
  const r = await complet(messages);
  yield { type: "texte", delta: String(r?.texte ?? "") };
  yield {
    type: "fin",
    modele: r?.modele,
    sites: r?.sites,
    consulte: r?.consulte,
    messageId: r?.messageId,
  };
}
