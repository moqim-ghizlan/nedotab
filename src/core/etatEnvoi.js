/** Delay before a pending write is worth telling (ms). Firestore flags every write as "pending" for a moment. */
export const DELAI_ATTENTE_MS = 5000;

/**
 * What to tell about the writes not yet acknowledged by the server (pure).
 * - nothing pending: nothing (offline alone is told as a calm note);
 * - pending for a short time: nothing (a normal, brief wait: it used to blink under the title);
 * - pending for longer than the delay, or offline: a message.
 *
 * @param {{ enAttente: number, horsLigne: boolean, depuis: number|null, maintenant: number, delai?: number }} d
 * @returns {{ texte: string, important: boolean }}
 */
export function texteEnvoi({ enAttente, horsLigne, depuis, maintenant, delai = DELAI_ATTENTE_MS }) {
  if (horsLigne) return { texte: enAttente > 0 ? `Hors ligne · ${enAttente} en attente d'envoi` : "Hors ligne", important: false };
  if (enAttente > 0 && depuis != null && maintenant - depuis >= delai) return { texte: `Envoi en cours (${enAttente})`, important: false };
  return { texte: "", important: false };
}
