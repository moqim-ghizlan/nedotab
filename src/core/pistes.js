/**
 * Pistes (7.3): a todo holds several pistes, each with a title, a plain-text description and one
 * picture. Pure: no DOM, no Firebase. Everything a piste holds comes from the user (hostile by
 * default): only ever shown as text.
 *
 * Piste: { id, titre, description, imageId: string|null }. `imageId` points to an entry of the
 * todo's `images` list (the metadata and the storage path stay in ONE place, as before).
 *
 * A todo written before 7.3 (`v: 1`) has no `pistes`: it is READ as a todo with ONE piste that
 * carries its description and its picture, and the title stays the todo's. Nothing is written
 * until the user saves it (then it becomes `v: 2`): nothing is lost, and reading again gives the
 * same result.
 */
export const VERSION_TODO_PISTES = 2;
/** 5: the Firestore rules check the places one by one (1000 evaluations at most per request). */
export const PISTES_MAX = 5;
export const PISTE_TITRE_MAX = 200;
export const PISTE_DESCRIPTION_MAX = 20_000;
/** Id of the piste made from a todo of the old format. */
export const ID_PISTE_PRINCIPALE = "principale";

const longueur = (texte) => [...String(texte ?? "")].length;
const normaliserTexte = (t) => String(t ?? "").replace(/\r\n?/g, "\n");

export const nouvelIdPiste = (aleatoire = (n) => crypto.getRandomValues(new Uint8Array(n))) =>
  [...aleatoire(8)].map((o) => o.toString(16).padStart(2, "0")).join("");

/** A new, empty piste. */
export function creerPiste({ titre = "", description = "", imageId = null, id } = {}, genererId = nouvelIdPiste) {
  return {
    id: id ?? genererId(),
    titre: String(titre).replace(/\s+/g, " ").trim(),
    description: normaliserTexte(description),
    imageId: typeof imageId === "string" && imageId ? imageId : null,
  };
}

/** A piste has nothing to keep: no title, no text, no picture. */
export const pisteVide = (p, imageNouvelle = false) =>
  !p.titre?.trim() && !p.description?.trim() && !p.imageId && !imageNouvelle;

/** @returns {string|null} an error message, or null */
export function validerPistes(pistes) {
  if (!Array.isArray(pistes)) return "Les pistes sont invalides.";
  if (pistes.length > PISTES_MAX) return `Un todo ne peut avoir que ${PISTES_MAX} pistes.`;
  const vus = new Set();
  for (const p of pistes) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id || p.id.length > 40)
      return "Une piste est invalide.";
    if (vus.has(p.id)) return "Deux pistes ont le même identifiant.";
    vus.add(p.id);
    if (typeof p.titre !== "string" || longueur(p.titre) > PISTE_TITRE_MAX)
      return `Le titre d'une piste est limité à ${PISTE_TITRE_MAX} caractères.`;
    if (typeof p.description !== "string" || longueur(p.description) > PISTE_DESCRIPTION_MAX)
      return `La description d'une piste est limitée à ${PISTE_DESCRIPTION_MAX.toLocaleString("fr-FR")} caractères.`;
    if (p.imageId != null && (typeof p.imageId !== "string" || p.imageId.length !== 32))
      return "L'image d'une piste est invalide.";
  }
  return null;
}

/** Pistes of a stored v2 document, validated on EVERY read (an invalid piste is dropped). */
export function lirePistesBrutes(brut) {
  if (!Array.isArray(brut)) return [];
  const vus = new Set();
  const sortie = [];
  for (const p of brut) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id || p.id.length > 40) continue;
    if (vus.has(p.id)) continue;
    vus.add(p.id);
    sortie.push({
      id: p.id,
      titre: typeof p.titre === "string" ? [...p.titre].slice(0, PISTE_TITRE_MAX).join("") : "",
      description:
        typeof p.description === "string" ? [...p.description].slice(0, PISTE_DESCRIPTION_MAX).join("") : "",
      imageId: typeof p.imageId === "string" && p.imageId.length === 32 ? p.imageId : null,
    });
    if (sortie.length >= PISTES_MAX) break;
  }
  return sortie;
}

/**
 * The pistes of a todo as the application uses them: those of a v2 document, or the single piste
 * made from an old todo (its description and its first picture).
 * @param {{ v?: number, pistes?: any[], description?: string, images?: {id:string}[] }} brut
 */
export function pistesDe(brut) {
  const images = Array.isArray(brut?.images) ? brut.images : [];
  if (Array.isArray(brut?.pistes) && brut.v >= VERSION_TODO_PISTES) {
    const pistes = lirePistesBrutes(brut.pistes);
    // A piste never points to a picture that is not in the list (deleted elsewhere).
    return pistes.map((p) => (p.imageId && !images.some((i) => i.id === p.imageId) ? { ...p, imageId: null } : p));
  }
  const image = images[0] ?? null;
  const description = typeof brut?.description === "string" ? brut.description : "";
  if (!description && !image) return [];
  return [{ id: ID_PISTE_PRINCIPALE, titre: "", description, imageId: image?.id ?? null }];
}

/** The picture of a piste, in the todo's list (null when it has none). */
export const imageDePiste = (todo, piste) =>
  (piste?.imageId && todo?.images?.find((i) => i.id === piste.imageId)) || null;

/** One line of text for a list: the first non-empty line of the first piste that has one. */
export function apercuPistes(pistes, max = 90) {
  for (const p of pistes ?? []) {
    const ligne = (p.description ?? "").split("\n").find((l) => l.trim());
    const texte = (p.titre?.trim() ? `${p.titre.trim()}` : "") || ligne?.trim();
    if (texte) return [...texte].slice(0, max).join("");
  }
  return "";
}
