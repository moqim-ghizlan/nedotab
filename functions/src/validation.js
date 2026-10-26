/**
 * Strict checking of what the browser sends to the AI functions (V4.0). Small home-made
 * schema: each field has a type and its limits; anything else is refused.
 */
export const TAILLE_MAX_REQUETE = 200 * 1024;

export class EntreeInvalide extends Error {}

/**
 * @param {unknown} donnees
 * @param {Record<string, { type: "chaine"|"entier"|"booleen", requis?: boolean, min?: number,
 *         max?: number, motif?: RegExp, valeurs?: () => string[] }>} schema
 * @returns {Record<string, unknown>} only the fields of the schema
 */
export function valider(donnees, schema) {
  if (donnees == null) donnees = {};
  if (typeof donnees !== "object" || Array.isArray(donnees))
    throw new EntreeInvalide("Paramètres attendus sous forme d'objet.");
  if (JSON.stringify(donnees).length > TAILLE_MAX_REQUETE)
    throw new EntreeInvalide("Requête trop volumineuse.");
  for (const cle of Object.keys(donnees))
    if (!(cle in schema)) throw new EntreeInvalide(`Paramètre inconnu : ${cle}.`);
  const resultat = {};
  for (const [cle, regle] of Object.entries(schema)) {
    const v = donnees[cle];
    if (v === undefined || v === null) {
      if (regle.requis) throw new EntreeInvalide(`Paramètre manquant : ${cle}.`);
      continue;
    }
    if (regle.type === "chaine") {
      if (typeof v !== "string") throw new EntreeInvalide(`${cle} : texte attendu.`);
      if (regle.min != null && v.length < regle.min)
        throw new EntreeInvalide(`${cle} : trop court.`);
      if (regle.max != null && v.length > regle.max)
        throw new EntreeInvalide(`${cle} : trop long.`);
      if (regle.motif && !regle.motif.test(v))
        throw new EntreeInvalide(`${cle} : format invalide.`);
      if (regle.valeurs && !regle.valeurs().includes(v))
        throw new EntreeInvalide(`${cle} : valeur non prise en charge.`);
    } else if (regle.type === "entier") {
      if (!Number.isInteger(v)) throw new EntreeInvalide(`${cle} : nombre entier attendu.`);
      if (regle.min != null && v < regle.min) throw new EntreeInvalide(`${cle} : trop petit.`);
      if (regle.max != null && v > regle.max) throw new EntreeInvalide(`${cle} : trop grand.`);
    } else if (regle.type === "booleen") {
      if (typeof v !== "boolean") throw new EntreeInvalide(`${cle} : vrai ou faux attendu.`);
    }
    resultat[cle] = v;
  }
  return resultat;
}
