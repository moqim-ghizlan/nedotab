/** Extension implementation of the platform layer (chrome.*). */
import { creerStockage } from "./stockageChrome.js";

export function getVersion() {
  return chrome.runtime.getManifest().version;
}

let stockageCourant;
export function stockage() {
  stockageCourant ??= creerStockage(chrome.storage.local, chrome.storage.onChanged);
  return stockageCourant;
}
