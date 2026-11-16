/**
 * V5.3: background worker of the extension. Listeners are registered at the TOP LEVEL so that
 * Chrome wakes the worker for them (a listener added inside a promise is not woken).
 */
import { creerVpn } from "./vpn.js";

const vpn = creerVpn();

/**
 * webRequest on <all_urls> throws until the optional host permissions are granted (e.g. on a
 * fresh install, before the VPN is first enabled): the rest of the worker must still register.
 * Registered again when the permission is granted (the listeners stay if already added).
 */
function brancherWebRequest() {
  chrome.permissions.contains({ origins: ["https://*/*", "http://*/*"] }, (accordee) => {
    if (!accordee) return;
    if (!chrome.webRequest.onAuthRequired.hasListener(vpn.surAuth)) {
      chrome.webRequest.onAuthRequired.addListener(vpn.surAuth, { urls: ["<all_urls>"] }, [
        "asyncBlocking",
      ]);
    }
    if (!chrome.webRequest.onCompleted.hasListener(vpn.surRequeteReussie)) {
      chrome.webRequest.onCompleted.addListener(vpn.surRequeteReussie, {
        urls: ["<all_urls>"],
      });
    }
  });
}
brancherWebRequest();
chrome.permissions.onAdded.addListener(brancherWebRequest);
chrome.proxy.onProxyError.addListener((details) => {
  vpn.signalerErreurServeur(details);
});
chrome.runtime.onStartup.addListener(() => vpn.reappliquer());
chrome.runtime.onInstalled.addListener(() => vpn.reappliquer());
