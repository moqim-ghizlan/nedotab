/**
 * Internal log (V3.10): the last events, in memory only, never sent anywhere. It exists to
 * be read in the Diagnostic panel and copied by the user. Pure: no DOM, no console.
 *
 * No personal data goes in: a full URL is cut down to its domain, an e-mail address and a
 * token are masked, also inside error messages and stack traces.
 */
export const TAILLE_JOURNAL = 500;
export const CATEGORIES = ["sync", "auth", "stockage", "glisser", "sw", "erreur"];

const RE_URL = /\b(?:https?|wss?):\/\/([^\s/?#"'<>)]+)[^\s"'<>)]*/gi;
const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// A long mixed run of letters and digits: an ID token, an API key, a session id.
const RE_JETON = /\b(?=[A-Za-z0-9._-]*\d)(?=[A-Za-z0-9._-]*[A-Za-z])[A-Za-z0-9._-]{28,}\b/g;

/** Text without the parts that identify the user or give access. */
export function assainir(texte) {
  return String(texte)
    .replace(RE_URL, (_, domaine) => domaine)
    .replace(RE_EMAIL, "[e-mail]")
    .replace(RE_JETON, "[jeton]");
}

/** Anything the log may receive (error, object, list…) as one short sanitized text. */
export function texteSur(valeur, max = 300) {
  let t;
  if (valeur instanceof Error) t = `${valeur.name}: ${valeur.message}\n${valeur.stack ?? ""}`;
  else if (typeof valeur === "string") t = valeur;
  else {
    try {
      t = JSON.stringify(valeur);
    } catch {
      t = String(valeur);
    }
  }
  const propre = assainir(t ?? "");
  return propre.length > max ? `${propre.slice(0, max)}…` : propre;
}

/**
 * Circular buffer of `max` entries { t, niveau, categorie, message }.
 * @param {{ max?: number, horloge?: () => number }} options
 */
export function creerJournalInterne({ max = TAILLE_JOURNAL, horloge = () => Date.now() } = {}) {
  const entrees = [];
  return {
    ajouter(categorie, message, { niveau = "info" } = {}) {
      entrees.push({ t: horloge(), niveau, categorie, message: texteSur(message, 600) });
      if (entrees.length > max) entrees.splice(0, entrees.length - max);
    },
    /** The last `n` entries, oldest first. */
    dernieres: (n = max) => entrees.slice(-n),
    taille: () => entrees.length,
    vider: () => void (entrees.length = 0),
  };
}
