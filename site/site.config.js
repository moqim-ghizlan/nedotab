/**
 * Showcase site settings. Every value marked "À COMPLÉTER" is a decision that belongs to
 * the project owner (plan V1.11): it is shown as such on the site until it is filled in.
 */
export default {
  nom: "NedoTab",
  // Public address of the site (canonical links, Open Graph). Pending: domain / hosting.
  urlPublique: "https://moqim-ghizlan.github.io/nedotab/",
  depot: "https://github.com/moqim-ghizlan/nedotab",
  // Legal notice (mentions légales): publisher and contact.
  editeur: "GHIZLAN Moqim",
  contact: "moqim.ghizlan@hotmail.com",
  // Privacy policy (V2.10): where the account's data is stored (Firestore location chosen
  // when the database was created), and the date of the last update of the policy.
  regionDonnees: "Europe (multirégion eur3 : Belgique et Pays-Bas)",
  dateConfidentialite: "24/10/2026",
  // Host of the site: GitHub Pages by default (the zip is served by the site itself).
  hebergeur: {
    nom: "GitHub, Inc. (GitHub Pages)",
    adresse: "88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis",
    confirme: true,
  },
};
