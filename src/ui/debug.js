import { el } from "./dom.js";

/**
 * Diagnostic mode (V3.10): Eruda console, "DEBUG" badge, Diagnostic panel. It adds
 * visibility, it never changes how the app behaves. The web app only: the extension has
 * the Chrome DevTools, and Eruda is not in its package.
 */
const CLE_SESSION = "nedotab-debug";
const TOUCHES_REQUISES = 7;
const FENETRE_MS = 3000;

/** "?debug" in the address turns the mode on for this session (Safari, not the installed app). */
export function debugParUrl(loc = globalThis.location, stockage = globalThis.sessionStorage) {
  try {
    if (loc && new URLSearchParams(loc.search).has("debug")) stockage?.setItem(CLE_SESSION, "1");
    return stockage?.getItem(CLE_SESSION) === "1";
  } catch {
    return !!loc && new URLSearchParams(loc.search).has("debug");
  }
}

/** On for this session ("?debug") or on this device (hidden switch, `reglagesAppareil.debug`). */
export const modeDebug = (store, parUrl = debugParUrl()) =>
  parUrl || !!store.lire().reglagesAppareil?.debug;

/** Opens the Eruda console. Loaded only now, from a file of its own (never in the extension). */
export async function ouvrirConsole() {
  if (import.meta.env.VITE_TARGET !== "pwa") return false;
  const { default: eruda } = await import("eruda");
  if (!eruda._isInit) eruda.init();
  eruda.show();
  return true;
}

/** Small "DEBUG" badge in a corner while the mode is on, so that it is not forgotten. */
export function monterBadgeDebug(store, parent = document.body) {
  const badge = el("div", { class: "badge-debug", role: "status", texte: "DEBUG" });
  const maj = () => {
    if (modeDebug(store)) parent.append(badge);
    else badge.remove();
  };
  store.abonner(maj);
  maj();
}

/**
 * Hidden switch: 7 taps within 3 seconds on `element` (the version number in the settings).
 * @param {() => void} basculer
 * @returns {() => void} the click handler is already attached; this unplugs it
 */
export function brancherGesteVersion(element, basculer, horloge = () => Date.now()) {
  let touches = [];
  const surClic = () => {
    const maintenant = horloge();
    touches = [...touches.filter((t) => maintenant - t < FENETRE_MS), maintenant];
    if (touches.length < TOUCHES_REQUISES) return;
    touches = [];
    basculer();
  };
  element.addEventListener("click", surClic);
  return () => element.removeEventListener("click", surClic);
}
