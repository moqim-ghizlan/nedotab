/**
 * Short vibration when an icon is picked up or dropped (V4.5.6), if the device setting is on.
 * Android and desktop Chrome use the Vibration API; Safari on iOS has none, so a hidden
 * "switch" checkbox is toggled instead (iOS 17.4+ answers a switch with a light tap).
 */
let interrupteur = null;

export function vibrer(store, ms = 10) {
  if (!store.lire().reglagesAppareil?.retourHaptique) return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
      return;
    }
    if (!interrupteur) {
      const etiquette = document.createElement("label");
      etiquette.setAttribute("aria-hidden", "true");
      etiquette.style.cssText = "position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none";
      const champ = document.createElement("input");
      champ.type = "checkbox";
      champ.setAttribute("switch", "");
      champ.tabIndex = -1;
      etiquette.append(champ);
      document.body.append(etiquette);
      interrupteur = etiquette;
    }
    interrupteur.click();
  } catch {
    /* haptic feedback is only a nicety */
  }
}
