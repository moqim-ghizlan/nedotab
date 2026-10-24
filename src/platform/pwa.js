/** PWA implementation of the platform layer (V3). Same signatures as extension.js. */

export function getVersion() {
  return import.meta.env.VITE_VERSION;
}

export function stockage() {
  throw new Error("Stockage PWA prévu en V3");
}
