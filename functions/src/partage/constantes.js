// Copy of src/core/constantes.js (functions are deployed without src/): tests/fonctions/partage.test.js checks it stays identical.
export const NOM_APP = "NedoTab";
export const VERSION_SCHEMA = 3;
export const PROFONDEUR_MAX = 3;
/**
 * Public showcase site. Pending decision (domain / hosting): GitHub Pages address of the
 * repository by default. Change it here only.
 */
export const URL_SITE = "https://moqim-ghizlan.github.io/nedotab/";

/**
 * V4.21 — score d'usage. NE JAMAIS MODIFIER ces deux valeurs après la mise en production :
 * tous les poids déjà stockés dans `users/{uid}/stats/visites` seraient faussés.
 */
export const EPOQUE_USAGE = Date.UTC(2026, 0, 1);
export const DEMI_VIE_JOURS = 30;
