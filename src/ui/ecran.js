/** Shorter side of the screen in CSS px: the same in portrait and landscape (V3.4). */
export const petitCote = () =>
  Math.min(globalThis.screen?.width ?? Infinity, globalThis.screen?.height ?? Infinity);

/**
 * iOS keyboard (V3.4): keeps --clavier on the root at the height of the page hidden by the
 * keyboard, so that the bottom sheets go up above it (dialogues.css).
 */
export function suivreClavier(vue = globalThis.visualViewport, racine = document.documentElement) {
  if (!vue) return;
  const maj = () => {
    const cache = Math.max(0, globalThis.innerHeight - vue.height - vue.offsetTop);
    if (cache > 0) racine.style.setProperty("--clavier", `${Math.round(cache)}px`);
    else racine.style.removeProperty("--clavier");
  };
  vue.addEventListener("resize", maj);
  vue.addEventListener("scroll", maj);
}

/** A touch screen without a mouse nor a trackpad (so most likely without a keyboard). */
export const toucherSeulement = (mm = globalThis.matchMedia) =>
  !!mm?.("(pointer: coarse)").matches && !mm("(any-pointer: fine)").matches;
