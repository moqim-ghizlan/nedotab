/**
 * Rules of the chat conversation (V4.11), pure. The conversation lives in memory only: the
 * panel keeps `{ id, role, texte, date, etat }` messages and sends the server the part that
 * respects its limits (functions/src/ia/fonctions.js, verifierMessagesChat).
 */
export const MESSAGES_MAX = 40;
export const MESSAGE_MAX = 4000;
export const TOTAL_MAX = 30000;
export const COMPTEUR_DES = 3500;
/** "Nouvelle conversation" asks for a confirmation above this number of messages. */
export const CONFIRMER_AU_DELA = 4;

export const compteurVisible = (longueur) => longueur >= COMPTEUR_DES;

/**
 * What is sent for the next answer. Messages that failed are left out; the oldest ones are
 * dropped to respect the limits (40 messages, 30 000 characters), always keeping the last
 * message of the user; the history never starts with an answer.
 * @param {{ role: "user"|"assistant", texte: string, etat?: string }[]} messages
 * @returns {{ messages: { role: string, texte: string }[], tronque: boolean }}
 */
export function preparerEnvoi(messages) {
  const valides = messages.filter((m) => m.etat !== "erreur" || m === messages.at(-1));
  const choisis = [];
  let total = 0;
  for (let i = valides.length - 1; i >= 0; i--) {
    const m = valides[i];
    if (choisis.length >= MESSAGES_MAX || total + m.texte.length > TOTAL_MAX) break;
    choisis.unshift({ role: m.role, texte: m.texte });
    total += m.texte.length;
  }
  while (choisis.length > 1 && choisis[0].role !== "user") choisis.shift();
  return { messages: choisis, tronque: choisis.length < valides.length };
}
