/** PWA implementation of the platform layer (V3). Same signatures as extension.js. */

export function getVersion() {
  return import.meta.env.VITE_VERSION;
}

export function stockage() {
  throw new Error("Stockage PWA prévu en V3");
}

export const preferences = {
  async lire() {
    return undefined;
  },
  async ecrire() {},
};

/** A web page cannot read other sites (CORS): no site permission in the PWA. */
export const permissionsSites = {
  disponible: false,
  contient: async () => false,
  demander: async () => false,
  retirer: async () => false,
};

export async function lirePage() {
  return null;
}

export async function lireJson() {
  return null;
}

export function urlFaviconNavigateur() {
  return null;
}

export { fichiers } from "./fichiers.js";

/** No access to the default engine from a web page: Google search URL. */
export function rechercherSurLeWeb(texte, { nouvelOnglet = false } = {}) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(texte)}`;
  if (nouvelOnglet) window.open(url, "_blank", "noopener");
  else location.assign(url);
}
