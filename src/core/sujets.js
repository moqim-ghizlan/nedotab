/**
 * Subjects of the todo list (V6.0): the only level above the todos (Subject → Todos, no
 * sub-subject). Pure: no DOM, no Firebase. A name comes from the user: it is only ever shown
 * with textContent.
 *
 * Subject: { id, nom, ordre, couleur, creeLe (ms or null while pending), modifieLe,
 *            nbRestants, nbTotal }
 */
export const LIMITE_SUJETS = 30;
export const NOM_SUJET_MAX = 60;
/** Fixed palette (V6.1): ids only, the colours come from the theme variables. */
export const COULEURS_SUJET = ["pin", "mer", "ciel", "prune", "rose", "ambre", "sable", "ardoise"];
export const ECART_ORDRE = 1000;

// Control characters and bidirectional marks (RTL tricks) never belong to a name.
const CARACTERES_INTERDITS = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

/** Name cleaned: no control or direction character, one space between words, 60 characters. */
export function nettoyerNom(nom) {
  return [...String(nom ?? "").replace(CARACTERES_INTERDITS, " ").replace(/\s+/g, " ").trim()]
    .slice(0, NOM_SUJET_MAX)
    .join("");
}

export const estCouleurSujet = (c) => COULEURS_SUJET.includes(c);

/** @returns {string|null} an error message, or null */
export function validerNom(nom) {
  const propre = nettoyerNom(nom);
  if (!propre) return "Donnez un nom au sujet.";
  if ([...String(nom).trim()].length > NOM_SUJET_MAX)
    return `Le nom est limité à ${NOM_SUJET_MAX} caractères.`;
  return null;
}

/** True when the counter says the list of subjects is full. */
export const estPleinSujets = (nb) => nb >= LIMITE_SUJETS;

/**
 * New subject. `ordre` comes from `ordreEntre` (see todos.js); without it the subject goes last.
 * @returns {{ ok: true, sujet: object } | { ok: false, erreur: string }}
 */
export function creerSujet({ nom, ordre = ECART_ORDRE, couleur = null }) {
  const erreur = validerNom(nom);
  if (erreur) return { ok: false, erreur };
  if (couleur !== null && !estCouleurSujet(couleur))
    return { ok: false, erreur: "Couleur inconnue." };
  return {
    ok: true,
    sujet: {
      nom: nettoyerNom(nom),
      ordre,
      couleur,
      nbRestants: 0,
      nbTotal: 0,
    },
  };
}

/** @returns {{ ok: true, sujet: object } | { ok: false, erreur: string }} a renamed copy */
export function renommerSujet(sujet, nom) {
  const erreur = validerNom(nom);
  if (erreur) return { ok: false, erreur };
  return { ok: true, sujet: { ...sujet, nom: nettoyerNom(nom) } };
}

const enMs = (t) => t?.toMillis?.() ?? (Number.isFinite(t) ? t : null);
const entierPositif = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

/** Subject from a Firestore document, or null when aberrant (the caller logs the type only). */
export function lireSujet(id, brut, enAttente = false) {
  if (!brut || typeof brut !== "object") return null;
  if (typeof brut.nom !== "string") return null;
  const nom = nettoyerNom(brut.nom);
  if (!nom) return null;
  return {
    id,
    nom,
    ordre: Number.isFinite(brut.ordre) ? brut.ordre : 0,
    couleur: estCouleurSujet(brut.couleur) ? brut.couleur : null,
    creeLe: enMs(brut.creeLe),
    modifieLe: enMs(brut.modifieLe),
    // Remaining can never exceed the total (a drifted counter would show "1" on an empty subject).
    nbRestants: Math.min(entierPositif(brut.nbRestants), entierPositif(brut.nbTotal)),
    nbTotal: entierPositif(brut.nbTotal),
    enAttente,
  };
}

/** By `ordre`, then creation date, then id: stable whatever the order of arrival. */
export function trierSujets(sujets) {
  const date = (s) => s.creeLe ?? Number.MAX_SAFE_INTEGER;
  return [...sujets].sort(
    (a, b) => a.ordre - b.ordre || date(a) - date(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Export (RGPD): what the user wrote, never an internal counter. */
export function exporterSujets(sujets) {
  return trierSujets(sujets).map((s) => ({
    id: s.id,
    nom: s.nom,
    couleur: s.couleur ?? null,
    ordre: s.ordre,
    creeLe: s.creeLe ?? null,
    modifieLe: s.modifieLe ?? null,
  }));
}
