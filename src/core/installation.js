/**
 * Help to add the web app to the home screen (V3.1). iOS never offers it by itself: the
 * banner explains "Share, then Add to Home Screen". Only in Safari on iPhone or iPad (the
 * other iOS browsers have other menus), never in the installed app, never once closed.
 */
export const doitAfficherBandeau = ({ ios, safari, installee, ferme }) =>
  ios && safari && !installee && !ferme;

/** iOS and Safari read from the browser's description (an iPad says "Macintosh"). */
export function navigateurIos({ userAgent = "", maxTouchPoints = 0 } = {}) {
  const ios =
    /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
  // Chrome, Firefox, Edge, Opera, Google and in-app browsers on iOS add their own name.
  const autre = /crios|fxios|edgios|opios|opt\/|gsa\/|fban|fbav|instagram|line\//i.test(userAgent);
  return { ios, safari: ios && /safari/i.test(userAgent) && !autre };
}
