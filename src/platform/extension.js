/** Extension implementation of the platform layer (chrome.*). */

export function getVersion() {
  return chrome.runtime.getManifest().version;
}
