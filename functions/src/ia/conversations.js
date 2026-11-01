/**
 * Conversations of the chat (V4.15): users/{uid}/conversations/{convId} and its messages
 * (.../messages/{msgId}). The browser writes the user's messages and renames; this module,
 * with the Admin SDK, reads the history sent to the model (the browser can no longer forge
 * it), writes the answers of the assistant, keeps the counters of the conversation and the
 * limits (100 conversations, 200 messages each), and deletes a conversation with its messages.
 */
import { ErreurFournisseur } from "./fournisseurs/commun.js";

export const CONVERSATIONS_MAX = 100;
export const MESSAGES_PAR_CONVERSATION_MAX = 200;
/** Messages read to build the history: the model keeps at most 40 (CHAT_MESSAGES_MAX). */
const MESSAGES_LUS = 60;
const APERCU_MAX = 100;
export const MOTIF_ID_CONVERSATION = /^[A-Za-z0-9_-]{8,64}$/;

const ID_COURT = /\[\[site:(s\d+)\]\]/g;

/** "s12" → real id in the text kept (the numbering of a list is only valid for one answer). */
export const referencesReelles = (texte, table) =>
  String(texte).replace(ID_COURT, (_, court) =>
    Object.hasOwn(table ?? {}, court) ? `[[site:${table[court]}]]` : "[[site:?]]",
  );

const apercu = (texte) => {
  const plat = String(texte).replace(/\[\[site:[^\]]*\]\]/g, "").replace(/\s+/g, " ").trim();
  return plat.length <= APERCU_MAX ? plat : `${plat.slice(0, APERCU_MAX - 1).trimEnd()}…`;
};

export function creerConversations({ db, horloge = () => Date.now(), aleatoire }) {
  const hasard =
    aleatoire ?? (() => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0"));
  const racine = (uid) => `users/${uid}/conversations`;
  const refConversation = (uid, convId) => db.doc(`${racine(uid)}/${convId}`);
  const messages = (uid, convId) => db.collection(`${racine(uid)}/${convId}/messages`);

  /** Id sorted like the time (13 digits of milliseconds), then random. */
  const idMessage = () => `${String(horloge()).padStart(13, "0")}-${hasard()}`;

  /**
   * The history for the model, read from Firestore: the oldest messages are left out, the
   * messages in error too, consecutive messages of one role are merged, it starts and ends
   * with the user. `remplacer(texte)` rewrites the references of the assistant's answers.
   */
  async function historique(uid, convId, { remplacer = (t) => t } = {}) {
    const conv = await refConversation(uid, convId).get();
    if (!conv.exists) throw new ErreurFournisseur("conversation-introuvable");
    const total = (await messages(uid, convId).count().get()).data().count;
    if (total >= MESSAGES_PAR_CONVERSATION_MAX) throw new ErreurFournisseur("conversation-pleine");
    const lus = await messages(uid, convId).orderBy("creeLe", "desc").limit(MESSAGES_LUS).get();
    const liste = [];
    for (const d of lus.docs.reverse()) {
      const m = d.data();
      if (m.etat === "erreur" || typeof m.texte !== "string" || !m.texte.trim()) continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      const texte = (role === "assistant" ? remplacer(m.texte) : m.texte).slice(0, 4000);
      if (liste.at(-1)?.role === role) liste.at(-1).texte = `${liste.at(-1).texte}\n\n${texte}`.slice(0, 4000);
      else liste.push({ role, texte });
    }
    while (liste[0]?.role === "assistant") liste.shift();
    if (liste.at(-1)?.role !== "user") throw new ErreurFournisseur("conversation-sans-question");
    return liste;
  }

  /** The answer of the assistant, written by the server, and the counters of the conversation. */
  async function enregistrerReponse(
    uid,
    convId,
    { texte, etat, modele, jetons, sitesCites, proposition },
  ) {
    const id = idMessage();
    const maintenant = new Date(horloge());
    await messages(uid, convId)
      .doc(id)
      .set({
        role: "assistant",
        texte,
        creeLe: maintenant,
        etat,
        ...(sitesCites?.length ? { sitesCites } : {}),
        ...(jetons ? { jetons } : {}),
        // V4.16: actions proposed by the assistant; the browser only changes the status.
        ...(proposition ? { proposition, statutProposition: "en_attente" } : {}),
      });
    const total = (await messages(uid, convId).count().get()).data().count;
    await refConversation(uid, convId).update({
      majLe: maintenant,
      nbMessages: total,
      apercu: apercu(texte),
      ...(modele ? { modele: String(modele).slice(0, 80) } : {}),
    });
    await rotation(uid);
    return id;
  }

  /** Beyond 100 conversations, the oldest ones (by last update) are deleted with their messages. */
  async function rotation(uid) {
    const n = (await db.collection(racine(uid)).count().get()).data().count;
    if (n <= CONVERSATIONS_MAX) return 0;
    const vieilles = await db
      .collection(racine(uid))
      .orderBy("majLe", "asc")
      .limit(n - CONVERSATIONS_MAX)
      .get();
    for (const d of vieilles.docs) await db.recursiveDelete(d.ref);
    return vieilles.docs.length;
  }

  /** Deletes a conversation and all its messages (no orphan message left). */
  async function supprimer(uid, convId) {
    const ref = refConversation(uid, convId);
    if (!(await ref.get()).exists) return { ok: true };
    await db.recursiveDelete(ref);
    return { ok: true };
  }

  return { historique, enregistrerReponse, rotation, supprimer, idMessage };
}
