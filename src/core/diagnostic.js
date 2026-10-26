import { assainir } from "./journal.js";

const heure = (t) => new Date(t).toISOString().slice(11, 19);

/**
 * Text of the Diagnostic panel (V3.10), to copy and send in a message. Only technical
 * facts: nothing here identifies the user (the device id is cut to 8 characters, text goes
 * through `assainir`).
 *
 * @param {Record<string, string|number|boolean|null|undefined>} infos label → value
 * @param {Array<{ t: number, niveau: string, categorie: string, message: string }>} entrees
 */
export function formaterDiagnostic(infos, entrees = []) {
  const lignes = Object.entries(infos).map(([k, v]) => `${k} : ${assainir(v ?? "—")}`);
  const journal = entrees.map(
    (e) => `${heure(e.t)} ${e.niveau === "erreur" ? "!" : " "} [${e.categorie}] ${e.message}`,
  );
  return [
    "NedoTab — diagnostic",
    ...lignes,
    "",
    `Journal (${journal.length} dernières entrées)`,
    ...journal,
  ].join("\n");
}

/** First characters of an identifier, enough to tell devices apart. */
export const abreger = (id, n = 8) => (id ? `${String(id).slice(0, n)}…` : "—");
