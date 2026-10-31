// Copy of src/core/besoinContexteSites.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * Does the chat need the list of the user's sites to answer? (V4.14) The list is sent with each
 * message, so it is the main cost lever of the chat: in "auto" mode it is joined only when the
 * conversation refers to the collection. Shared by the browser (tests) and the server
 * (functions/src/partage/, identical copy). Pure, no network.
 */
import { racinesDeQuestion } from "./preFiltre.js";
import { domaine } from "./url.js";

export const MODES_SITES_CHAT = ["auto", "toujours", "jamais"];
export const MODE_SITES_CHAT_PAR_DEFAUT = "auto";
export const LIBELLES_MODES_SITES_CHAT = {
  auto: "Quand c'est utile",
  toujours: "Toujours",
  jamais: "Jamais",
};

export const validerModeSitesChat = (v) =>
  MODES_SITES_CHAT.includes(v) ? v : MODE_SITES_CHAT_PAR_DEFAUT;

/** Lower case, no accent, apostrophes and hyphens as spaces ("j'ai" → "j ai"). */
const norm = (texte) =>
  String(texte ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’'`´-]/g, " ");

const MARQUEURS = new RegExp(
  String.raw`\b(?:(?:mes|mon|ma|ton|tes|ta) (?:sites?|dossiers?|favoris|liens?|outils?|collection|grille|liste|signets)|j ai|j avais|ai je|dans mon|dans mes|enregistr|sauvegard|rang(?:e|er|ement)\b|organis|doublons?|(?:sites?|outils?|liens?) (?:que j|qui sont|deja))`,
);

/**
 * @param {{ mode?: string, sites: Array<{ titre: string, url: string, tags: string[] }>,
 *   messages: Array<{ role: string, texte: string }> }} entree the conversation, last message
 *   from the user
 */
export function besoinContexteSites({ mode = MODE_SITES_CHAT_PAR_DEFAUT, sites, messages }) {
  const m = validerModeSitesChat(mode);
  if (m === "jamais" || !sites?.length) return false;
  if (m === "toujours") return true;
  const dernier = messages.findLast((x) => x.role === "user")?.texte ?? "";
  const precedente = messages.slice(0, -1).findLast((x) => x.role === "assistant")?.texte ?? "";
  // The assistant was just talking about the collection: a short follow-up still concerns it.
  if (precedente.includes("[[site:")) return true;
  if (MARQUEURS.test(norm(dernier))) return true;
  const racines = racinesDeQuestion(dernier).filter((r) => r.length >= 4);
  if (!racines.length) return false;
  const index = norm(sites.map((s) => `${s.titre} ${domaine(s.url)} ${s.tags.join(" ")}`).join(" "));
  return racines.some((r) => index.includes(r));
}
