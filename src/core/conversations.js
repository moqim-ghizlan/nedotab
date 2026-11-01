/**
 * Conversations of the chat (V4.15): pure rules shared by the panel and the history list.
 * users/{uid}/conversations/{convId} { titre, creeLe, majLe, nbMessages, modele, apercu }
 * .../messages/{msgId} { role, texte, creeLe, etat, origine?, sitesCites? } — see
 * docs/plan/v4/v4.15.md. No DOM, no network.
 */
export const TITRE_MAX = 80;
export const MOTS_TITRE = 6;
export const TITRE_PAR_DEFAUT = "Nouvelle conversation";
export const CONVERSATIONS_MAX = 100;
export const MESSAGES_PAR_CONVERSATION_MAX = 200;
export const MESSAGES_CHARGES = 50;
export const CONVERSATIONS_PAR_PAGE = 20;

/** Title without any call: the first 6 words of the first message, cleaned. */
export function titreDepuis(texte) {
  const mots = String(texte ?? "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[`*_#>[\]()|~]/g, " ")
    .split(/\s+/)
    .map((m) => m.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}?!]+$/gu, ""))
    .filter(Boolean)
    .slice(0, MOTS_TITRE);
  const titre = mots.join(" ").slice(0, TITRE_MAX).trim();
  return titre ? titre[0].toLocaleUpperCase("fr") + titre.slice(1) : TITRE_PAR_DEFAUT;
}

/** A title typed by the user: trimmed, 1 to 80 characters, or null. */
export function titreValide(texte) {
  const t = String(texte ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, TITRE_MAX) : null;
}

const alea = (n) => {
  const octets = new Uint8Array(n);
  globalThis.crypto.getRandomValues(octets);
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
};

/** Id of a conversation: letters and digits only (the server checks the same pattern). */
export const idConversation = () => `c${alea(10)}`;

/** Id of a message: 13 digits of time then random, so that the natural order is the time. */
export const idMessage = (maintenant = Date.now()) =>
  `${String(maintenant).padStart(13, "0")}-${alea(4)}`;

/** "à l'instant", "il y a 5 min", "il y a 3 h", "hier", "il y a 4 j", else the date. */
export function dateRelative(ms, maintenant = Date.now()) {
  if (!Number.isFinite(ms)) return "";
  const s = Math.max(0, Math.round((maintenant - ms) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  if (j === 1) return "hier";
  if (j < 7) return `il y a ${j} j`;
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A stored message as a message of the panel. */
export function messageDepuisDoc(doc, id) {
  const base = { id, fsId: doc.id, role: doc.role, texte: doc.texte, date: doc.creeLe, etat: "ok" };
  if (doc.origine) base.origine = doc.origine;
  if (doc.role === "assistant" && doc.etat === "interrompu") base.interrompu = true;
  // V4.16: actions proposed by the assistant, with their status (kept in the conversation).
  if (doc.proposition) {
    base.proposition = doc.proposition;
    base.statutProposition = doc.statutProposition ?? "en_attente";
  }
  return base;
}

/**
 * Adds to the messages of the panel the stored ones it does not have yet (another device,
 * or a conversation that is being opened), in time order. The ones being written here (no
 * `fsId` yet) stay at the end. `accepterAssistant` is false while an answer is being received:
 * it is adopted through the id the server returns, not read twice.
 * @returns the same array when nothing changes
 */
export function fusionner(locaux, docs, { nouvelId, accepterAssistant = true }) {
  const connus = new Map(locaux.filter((m) => m.fsId).map((m) => [m.fsId, m]));
  // A provisional answer (stopped here, or cut by the network) whose stored version arrives:
  // it is that same message, it takes its id and its final text instead of appearing twice.
  const debut = (t) => String(t).replace(/\[\[site:[^\]]*\]\]/g, "").trim().slice(0, 30);
  let adopte = false;
  for (const d of docs) {
    if (connus.has(d.id) || d.role !== "assistant" || d.creeLe == null) continue;
    const p = locaux.find(
      (m) =>
        m.provisoire &&
        !m.fsId &&
        m.role === "assistant" &&
        debut(m.texte) &&
        (debut(d.texte).startsWith(debut(m.texte)) || debut(m.texte).startsWith(debut(d.texte))),
    );
    if (!p) continue;
    p.fsId = d.id;
    p.texte = d.texte;
    p.date = d.creeLe;
    delete p.provisoire;
    if (d.etat === "interrompu") p.interrompu = true;
    connus.set(d.id, p);
    adopte = true;
  }
  const ajouts = docs
    .filter(
      (d) =>
        !connus.has(d.id) &&
        d.creeLe != null &&
        d.etat !== "erreur" &&
        (accepterAssistant || d.role !== "assistant"),
    )
    .map((d) => messageDepuisDoc(d, nouvelId()));
  let change = ajouts.length > 0 || adopte;
  for (const d of docs) {
    const m = connus.get(d.id);
    if (m && d.creeLe != null && m.date !== d.creeLe) {
      m.date = d.creeLe; // the time of the server, for a consistent order
      change = true;
    }
    // The status of a proposal changed elsewhere (applied on another device).
    if (m?.proposition && d.statutProposition && m.statutProposition !== d.statutProposition) {
      m.statutProposition = d.statutProposition;
      change = true;
    }
    // The proposal of an answer adopted by its id (the stream did not carry it).
    if (m && !m.proposition && d.proposition) {
      m.proposition = d.proposition;
      m.statutProposition = d.statutProposition ?? "en_attente";
      change = true;
    }
  }
  if (!change) return locaux;
  const stockes = [...locaux.filter((m) => m.fsId), ...ajouts].sort(
    (a, b) => a.date - b.date || String(a.fsId).localeCompare(String(b.fsId)),
  );
  return [...stockes, ...locaux.filter((m) => !m.fsId)];
}
