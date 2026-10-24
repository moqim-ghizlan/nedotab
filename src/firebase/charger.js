/**
 * Lazy loading of Firebase: a separate local chunk (allowed in MV3, it is not remote
 * code), fetched only when the account section is opened or a user is signed in.
 */
let chargement = null;
export function chargerFirebase() {
  chargement ??= import("./index.js");
  return chargement;
}
