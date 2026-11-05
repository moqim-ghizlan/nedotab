/**
 * Todos (V6.0): pure model, no DOM, no Firebase. Everything a todo holds comes from the user
 * (title, Markdown description, notes of the images): hostile by default, only ever shown as
 * text or through rendreMarkdown().
 *
 * Todo: { id, v, sujetId, titre, description, creeLe, modifieLe (ms or null while pending),
 *         echeance ('AAAA-MM-JJ' or null), fait, faitLe (ms or null), ordre, images: [] }
 */
export const VERSION_TODO = 1;
export const LIMITE_TODOS = 500;
export const TITRE_MAX = 200;
export const DESCRIPTION_MAX = 20_000;
export const IMAGES_MAX = 10;
export const NOTE_IMAGE_MAX = 300;
export const ECART_ORDRE = 1000;
export const ECART_MIN = 0.001;

/** Characters counted by code points (an emoji counts for one). */
export const longueur = (texte) => [...String(texte ?? "")].length;

/**
 * 'AAAA-MM-JJ' naming a real day of the calendar (no 30 February), never converted through UTC.
 */
export function echeanceValide(texte) {
  if (typeof texte !== "string") return false;
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(texte);
  if (!m) return false;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return jour <= new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

/** @returns {string|null} an error message, or null (an empty title is a draft: allowed) */
export function validerTodo({ titre = "", description = "", echeance = null } = {}) {
  if (typeof titre !== "string" || longueur(titre) > TITRE_MAX)
    return `Le titre est limité à ${TITRE_MAX} caractères.`;
  if (typeof description !== "string" || longueur(description) > DESCRIPTION_MAX)
    return `La description est limitée à ${DESCRIPTION_MAX.toLocaleString("fr-FR")} caractères.`;
  if (echeance !== null && !echeanceValide(echeance))
    return "Cette échéance n'est pas une date valide.";
  return null;
}

/** True when the counter says the list of todos is full. */
export const estPleinTodos = (nb) => nb >= LIMITE_TODOS;

/** New todo (not yet written). Line breaks are normalised; the title is trimmed. */
export function creerTodo({
  sujetId,
  titre = "",
  description = "",
  echeance = null,
  ordre = ECART_ORDRE,
}) {
  if (typeof sujetId !== "string" || !sujetId) return { ok: false, erreur: "Sujet introuvable." };
  const erreur = validerTodo({ titre: String(titre).trim(), description, echeance: echeance || null });
  if (erreur) return { ok: false, erreur };
  return {
    ok: true,
    todo: {
      v: VERSION_TODO,
      sujetId,
      titre: String(titre).trim(),
      description: String(description).replace(/\r\n?/g, "\n"),
      echeance: echeance || null,
      fait: false,
      faitLe: null,
      ordre,
      images: [],
    },
  };
}

export const CHAMPS_MODIFIABLES = [
  "sujetId",
  "titre",
  "description",
  "echeance",
  "fait",
  "faitLe",
  "ordre",
  "images",
];

/** Done / not done: `faitLe` is set when it becomes true, cleared (null) when it becomes false. */
export function basculerFait(todo, fait = !todo.fait, maintenant = Date.now()) {
  if (!!todo.fait === !!fait) return { ...todo };
  return { ...todo, fait: !!fait, faitLe: fait ? maintenant : null };
}

/**
 * A modified copy of `todo` (the original is untouched). Only the known fields are applied;
 * toggling `fait` goes through basculerFait so that `faitLe` stays coherent.
 * @returns {{ ok: true, todo: object } | { ok: false, erreur: string }}
 */
export function modifierTodo(todo, changements, maintenant = Date.now()) {
  const suivant = { ...todo };
  for (const cle of ["sujetId", "titre", "description", "ordre", "images"]) {
    if (!(cle in changements)) continue;
    suivant[cle] =
      cle === "description"
        ? String(changements[cle]).replace(/\r\n?/g, "\n")
        : cle === "titre"
          ? String(changements[cle]).trim()
          : changements[cle];
  }
  if ("echeance" in changements) suivant.echeance = changements.echeance || null;
  const erreur = validerTodo(suivant);
  if (erreur) return { ok: false, erreur };
  if (Array.isArray(suivant.images) && suivant.images.length > IMAGES_MAX)
    return { ok: false, erreur: `${IMAGES_MAX} images au maximum.` };
  if ("fait" in changements)
    return { ok: true, todo: basculerFait(suivant, !!changements.fait, maintenant) };
  return { ok: true, todo: suivant };
}

/**
 * The fields that differ between two versions: what a partial update sends. Two devices
 * changing different fields therefore never overwrite each other.
 */
export function champsModifies(avant, apres) {
  const diff = {};
  for (const cle of CHAMPS_MODIFIABLES) {
    if (JSON.stringify(avant[cle] ?? null) !== JSON.stringify(apres[cle] ?? null))
      diff[cle] = apres[cle] ?? null;
  }
  return diff;
}

const enMs = (t) => t?.toMillis?.() ?? (Number.isFinite(t) ? t : null);

/** Metadata of an image (V6.4): shape checked on every read. */
function lireImage(brut) {
  if (!brut || typeof brut !== "object") return null;
  if (typeof brut.id !== "string" || typeof brut.chemin !== "string") return null;
  return {
    id: brut.id,
    chemin: brut.chemin,
    note: typeof brut.note === "string" ? [...brut.note].slice(0, NOTE_IMAGE_MAX).join("") : "",
    taille: Number.isFinite(brut.taille) && brut.taille > 0 ? brut.taille : 0,
    typeMime: typeof brut.typeMime === "string" ? brut.typeMime : "",
    largeur: Number.isFinite(brut.largeur) ? brut.largeur : 0,
    hauteur: Number.isFinite(brut.hauteur) ? brut.hauteur : 0,
    ordre: Number.isFinite(brut.ordre) ? brut.ordre : 0,
  };
}

/**
 * Todo from a Firestore document: validated and normalised on EVERY read. An invalid document
 * returns null (the caller logs its kind, never its content).
 */
export function lireTodo(id, brut, enAttente = false) {
  if (!brut || typeof brut !== "object") return null;
  if (typeof brut.sujetId !== "string" || !brut.sujetId) return null;
  if (typeof brut.titre !== "string" || typeof brut.description !== "string") return null;
  if (longueur(brut.titre) > TITRE_MAX || longueur(brut.description) > DESCRIPTION_MAX) return null;
  if (brut.echeance != null && !echeanceValide(brut.echeance)) return null;
  const images = Array.isArray(brut.images)
    ? brut.images.map(lireImage).filter(Boolean).slice(0, IMAGES_MAX)
    : [];
  return {
    id,
    v: Number.isInteger(brut.v) ? brut.v : VERSION_TODO,
    sujetId: brut.sujetId,
    titre: brut.titre,
    description: brut.description,
    echeance: brut.echeance ?? null,
    fait: brut.fait === true,
    faitLe: enMs(brut.faitLe),
    creeLe: enMs(brut.creeLe),
    modifieLe: enMs(brut.modifieLe),
    ordre: Number.isFinite(brut.ordre) ? brut.ordre : 0,
    images: images.sort((a, b) => a.ordre - b.ordre),
    enAttente,
  };
}

/**
 * Order value between two neighbours (either may be null: start / end of the list).
 * @returns {number|null} null when the gap is exhausted (< 0.001): renumber with `renumeroter`
 */
export function ordreEntre(avant, apres) {
  const a = Number.isFinite(avant) ? avant : null;
  const b = Number.isFinite(apres) ? apres : null;
  if (a === null && b === null) return ECART_ORDRE;
  if (a === null) return b - ECART_ORDRE;
  if (b === null) return a + ECART_ORDRE;
  if (b - a < ECART_MIN * 2) return null;
  return (a + b) / 2;
}

/** Evenly spaced orders (1000, 2000…) for a list already in the wanted order: id → ordre. */
export function renumeroter(elements) {
  return new Map(elements.map((e, i) => [e.id, (i + 1) * ECART_ORDRE]));
}

/**
 * Stable sort: manual order, then creation date (a todo not yet confirmed by the server, whose
 * date is null, goes last), then id. Done todos are not separated here (the interface groups).
 */
export function trierTodos(todos) {
  const date = (t) => t.creeLe ?? Number.MAX_SAFE_INTEGER;
  return [...todos].sort(
    (a, b) => a.ordre - b.ordre || date(a) - date(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Export (RGPD): content and dates, image metadata without any storage path. */
export function exporterTodos(todos) {
  return trierTodos(todos).map((t) => ({
    id: t.id,
    sujetId: t.sujetId,
    titre: t.titre,
    description: t.description,
    echeance: t.echeance ?? null,
    fait: !!t.fait,
    faitLe: t.faitLe ?? null,
    creeLe: t.creeLe ?? null,
    modifieLe: t.modifieLe ?? null,
    ordre: t.ordre,
    images: (t.images ?? []).map(({ id, note, taille, typeMime, largeur, hauteur, ordre }) => ({
      id,
      note,
      taille,
      typeMime,
      largeur,
      hauteur,
      ordre,
    })),
  }));
}
