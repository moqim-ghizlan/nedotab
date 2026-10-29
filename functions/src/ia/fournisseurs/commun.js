/**
 * What every AI provider adapter shares (V4.0): HTTP call with a 30 s timeout, one retry on
 * a server error or a timeout (never on a 4xx), and the provider's errors turned into common
 * codes. The key, the authorization header and the content of the messages are never put
 * in an error message nor in a log.
 *
 * Interface of an adapter (one file per provider):
 * @typedef {{ role: "user"|"assistant", texte: string }} Message
 * @typedef {{
 *   envoyer: (p: { cle: string, modele: string, systeme?: string, messages: Message[],
 *              maxJetons?: number, temperature?: number, formatJson?: boolean })
 *            => Promise<{ texte: string, jetonsEntree: number, jetonsSortie: number, modele: string }>,
 *   verifierCle: (p: { cle: string }) => Promise<{ valide: boolean, raison?: string }>,
 *   formatCle: RegExp,
 * }} Fournisseur
 */
export const DELAI_APPEL_MS = 30000;

export const CODES = [
  "cle-invalide",
  "limite-fournisseur",
  "cle-sans-credit",
  "requete-invalide",
  "modele-introuvable",
  "fournisseur-indisponible",
];

/**
 * Server-Sent Events of a streamed answer (V4.12): yields the `data` of each event, whatever
 * the way the network cut the packets (a line, a "\r\n" or a character may be split in two).
 * Comment lines (":") and other fields are ignored; "[DONE]" is a marker, not an event.
 * @param {AsyncIterable<Uint8Array>} corps body of the response
 */
export async function* analyserSse(corps) {
  const decodeur = new TextDecoder();
  let tampon = "";
  let donnees = [];
  function* evenements(fin) {
    // A "\r" at the very end may be the first half of a "\r\n": wait for the next packet.
    const attente = !fin && tampon.endsWith("\r") ? "\r" : "";
    const lignes = tampon.slice(0, tampon.length - attente.length).split(/\r\n|\n|\r/);
    tampon = fin ? "" : lignes.pop() + attente;
    for (const ligne of lignes) {
      if (ligne === "") {
        if (donnees.length) yield donnees.join("\n");
        donnees = [];
      } else if (ligne.startsWith("data:")) donnees.push(ligne.slice(5).replace(/^ /, ""));
    }
    if (fin && donnees.length) {
      yield donnees.join("\n");
      donnees = [];
    }
  }
  for await (const paquet of corps) {
    tampon += decodeur.decode(paquet, { stream: true });
    for (const e of evenements(false)) {
      if (e === "[DONE]") return;
      yield e;
    }
  }
  tampon += decodeur.decode();
  for (const e of evenements(true)) if (e !== "[DONE]") yield e;
}

/** An error of a provider, with a common code (one of CODES) and no secret in it. */
export class ErreurFournisseur extends Error {
  constructor(code, statut = null) {
    super(code);
    this.code = code;
    this.statut = statut;
  }
}

/**
 * Common code of an HTTP answer that failed. `corps` is the parsed JSON body, if any:
 * some providers say "no credit left" with a 429 or a 400 and a specific reason.
 */
export function codeErreur(statut, corps) {
  const texte = JSON.stringify(corps ?? {}).toLowerCase();
  if (statut === 402 || texte.includes("insufficient_quota") || texte.includes("billing"))
    return "cle-sans-credit";
  if (statut === 401 || statut === 403 || texte.includes("api_key_invalid")) return "cle-invalide";
  if (statut === 429) return "limite-fournisseur";
  if (statut === 404) return "modele-introuvable";
  if (statut >= 400 && statut < 500) return "requete-invalide";
  return "fournisseur-indisponible";
}

/**
 * fetch with a timeout and one retry on 5xx / timeout / network failure.
 * @returns {Promise<any>} the JSON body of a 2xx answer
 * @throws {ErreurFournisseur}
 */
export async function appelJson(
  url,
  init,
  { fetch: f = globalThis.fetch, delai = DELAI_APPEL_MS } = {},
) {
  let derniere = null;
  for (let essai = 0; essai < 2; essai++) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), delai);
    try {
      const reponse = await f(url, { ...init, signal: arret.signal });
      const corps = await reponse.json().catch(() => null);
      if (reponse.ok) return corps;
      const code = codeErreur(reponse.status, corps);
      derniere = new ErreurFournisseur(code, reponse.status);
      if (code !== "fournisseur-indisponible") throw derniere;
    } catch (e) {
      if (e instanceof ErreurFournisseur && e.code !== "fournisseur-indisponible") throw e;
      derniere =
        e instanceof ErreurFournisseur ? e : new ErreurFournisseur("fournisseur-indisponible");
    } finally {
      clearTimeout(minuteur);
    }
  }
  throw derniere;
}
