// Copy of src/core/confidentialiteIa.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
/**
 * What the AI is allowed to see (V4.20): reglages.ia.confidentialite. Pure; shared by the browser
 * (settings screen) and the server (functions/src/partage/, identical copy). The settings are
 * APPLIED BY THE SERVER, which reads them in the user's own document: the browser only reflects
 * the choices, it cannot send more than they allow.
 *
 * Everything is allowed by default; only a refusal (false) is stored.
 */
export const REGLAGES_CONFIDENTIALITE = [
  {
    cle: "titresAdresses",
    libelle: "Envoyer les titres et adresses des sites",
    aide: "Nécessaire à la recherche intelligente et au chat avec vos sites : sans cela, ces fonctions sont désactivées.",
  },
  {
    cle: "tagsDescriptions",
    libelle: "Envoyer les tags et descriptions",
    aide: "Sinon ils sont retirés de la liste envoyée à l'assistant.",
  },
  {
    cle: "chemins",
    libelle: "Envoyer les noms de mes dossiers",
    aide: "Sinon le dossier de chaque site n'est pas indiqué.",
  },
  {
    cle: "lirePages",
    libelle: "Lire le contenu des pages pour proposer des tags",
    aide: "Sinon les tags sont proposés à partir du titre et de l'adresse seulement.",
  },
  {
    cle: "lectureServeur",
    libelle: "Lecture des pages par notre serveur (iPhone et iPad)",
    aide: "Sinon aucun tag n'est proposé depuis l'iPhone ou l'iPad.",
  },
  {
    cle: "historique",
    libelle: "Conserver l'historique des conversations",
    aide: "Sinon les conversations restent en mémoire et sont perdues à la fermeture.",
  },
];
const CLES = REGLAGES_CONFIDENTIALITE.map((r) => r.cle);

/** The settings cleaned: only the refusals (false) are kept; null when everything is allowed. */
export function validerConfidentialite(brut) {
  const sortie = {};
  for (const cle of CLES) if (brut?.[cle] === false) sortie[cle] = false;
  return Object.keys(sortie).length ? sortie : null;
}

/** Is `cle` allowed? (default: yes) */
export const permis = (conf, cle) => conf?.[cle] !== false;

/** Fields of the compact list (V4.9) the AI may receive. */
export function champsAutorises(conf) {
  const champs = [];
  if (permis(conf, "titresAdresses")) champs.push("titre", "domaine");
  if (permis(conf, "tagsDescriptions")) champs.push("tags", "description");
  if (permis(conf, "chemins")) champs.push("chemin");
  champs.push("ajoute"); // a month, never an address nor a title
  return champs;
}
