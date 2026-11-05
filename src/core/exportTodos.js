/**
 * Export / import of the subjects and the todos as JSON (V6.7). Pure: no DOM, no Firebase.
 *
 * The file holds what the user wrote (names, titles, Markdown descriptions, due dates, done or not,
 * order) and, for each picture, its metadata and note — NOT the picture itself, nor its path.
 * It is NOT encrypted: the interface says so. The import validates every element with the same
 * rules as a read from the database, regenerates every identifier (an identifier of the file is
 * never reused, so a file can neither overwrite data nor aim at another account) and only ever
 * ADDS: it never replaces.
 */
import { exporterSujets, lireSujet, LIMITE_SUJETS } from "./sujets.js";
import { exporterTodos, lireTodo, LIMITE_TODOS } from "./todos.js";

export const FORMAT_TODOS = "nedotab-todos";
export const FORMAT_COMPLET = "nedotab-export";
export const TAILLE_MAX_IMPORT = 10 * 1024 * 1024;

/** "nedotab-todos-2026-11-05.json" (local date). */
export function nomFichierExportTodos(date = new Date()) {
  const deux = (n) => String(n).padStart(2, "0");
  return `nedotab-todos-${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}.json`;
}

/** The file of "Exporter mes todos (JSON)". */
export function creerExportTodos({ sujets, todos }, { version, plateforme, maintenant = Date.now() }) {
  return {
    format: FORMAT_TODOS,
    versionFormat: 1,
    exporteLe: new Date(maintenant).toISOString(),
    application: { version, plateforme },
    todos: { sujets: exporterSujets(sujets), todos: exporterTodos(todos) },
  };
}

/** @returns {string|null} an error message when the file is too big, else null */
export function verifierTailleImport(taille) {
  return taille > TAILLE_MAX_IMPORT
    ? `Ce fichier est trop gros (${Math.round(TAILLE_MAX_IMPORT / 1024 / 1024)} Mo au maximum).`
    : null;
}

const texte = (v, max) => (typeof v === "string" && v.length <= max ? v : null);
const liste = (v) => (Array.isArray(v) ? v : []);

/**
 * Reads an export file and builds what would be added. Nothing is written here.
 * @param {string} contenu text of the file
 * @param {{ sujetsExistants?: number, todosExistants?: number }} [existant] already in the account
 * @returns {{ ok: false, erreur: string } | { ok: true, plan: object, resume: object }}
 */
export function validerImportTodos(contenu, { sujetsExistants = 0, todosExistants = 0 } = {}) {
  if (typeof contenu !== "string") return { ok: false, erreur: "Fichier illisible." };
  if (contenu.length > TAILLE_MAX_IMPORT) return { ok: false, erreur: verifierTailleImport(contenu.length) };
  let brut;
  try {
    brut = JSON.parse(contenu);
  } catch {
    return { ok: false, erreur: "Ce fichier n'est pas un JSON valide." };
  }
  if (!brut || typeof brut !== "object" || Array.isArray(brut))
    return { ok: false, erreur: "Ce fichier n'est pas un export NedoTab." };
  if (brut.format !== FORMAT_TODOS && brut.format !== FORMAT_COMPLET)
    return { ok: false, erreur: "Ce fichier n'est pas un export NedoTab." };
  const donnees = brut.todos;
  if (!donnees || typeof donnees !== "object" || !Array.isArray(donnees.sujets) || !Array.isArray(donnees.todos))
    return { ok: false, erreur: "Ce fichier ne contient pas de todos." };

  let ignores = 0;
  let tronque = false;
  let imagesIgnorees = 0;

  // Subjects: valid ones only, up to the limit, identifiers kept only to link the todos.
  const sujets = [];
  const gardes = new Map(); // old id → position in `sujets`
  liste(donnees.sujets).forEach((s, i) => {
    const ancienId = texte(s?.id, 200);
    const lu = ancienId ? lireSujet(ancienId, { nom: s?.nom, ordre: s?.ordre, couleur: s?.couleur }) : null;
    if (!lu || gardes.has(ancienId)) {
      ignores++;
      return;
    }
    if (sujetsExistants + sujets.length >= LIMITE_SUJETS) {
      tronque = true;
      ignores++;
      return;
    }
    gardes.set(ancienId, sujets.length);
    sujets.push({
      ancienId,
      nom: lu.nom,
      couleur: lu.couleur,
      ordre: Number.isFinite(s?.ordre) ? s.ordre : (i + 1) * 1000,
    });
  });

  // Todos: checked like a read from the database, linked to a kept subject, up to the limit.
  const todos = [];
  liste(donnees.todos).forEach((t, i) => {
    imagesIgnorees += Array.isArray(t?.images) ? t.images.length : 0;
    const lu = lireTodo(
      "importe",
      {
        v: 1,
        sujetId: t?.sujetId,
        titre: t?.titre,
        description: t?.description ?? "",
        echeance: t?.echeance ?? null,
        fait: t?.fait,
        ordre: t?.ordre,
        images: [],
      },
      false,
    );
    if (!lu || !gardes.has(lu.sujetId)) {
      ignores++;
      return;
    }
    if (todosExistants + todos.length >= LIMITE_TODOS) {
      tronque = true;
      ignores++;
      return;
    }
    todos.push({
      ancienSujetId: lu.sujetId,
      titre: lu.titre,
      description: lu.description,
      echeance: lu.echeance,
      fait: lu.fait,
      ordre: Number.isFinite(t?.ordre) ? t.ordre : (i + 1) * 1000,
    });
  });

  if (sujets.length === 0 && todos.length === 0)
    return { ok: false, erreur: "Ce fichier ne contient aucun sujet ni todo à importer." };
  return {
    ok: true,
    plan: { sujets, todos },
    resume: { nbSujets: sujets.length, nbTodos: todos.length, ignores, tronque, imagesIgnorees },
  };
}

/** "12 sujets, 143 todos, 2 ignorés" */
export function resumeImport({ nbSujets, nbTodos, ignores }) {
  const p = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  return `${p(nbSujets, "sujet")}, ${p(nbTodos, "todo")}${ignores ? `, ${ignores} ignoré${ignores > 1 ? "s" : ""}` : ""}`;
}
