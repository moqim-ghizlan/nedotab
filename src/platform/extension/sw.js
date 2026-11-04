/**
 * V5.3: background worker of the extension. Listeners are registered at the TOP LEVEL so that
 * Chrome wakes the worker for them (a listener added inside a promise is not woken).
 */
import { creerVpn } from "./vpn.js";

const vpn = creerVpn();

chrome.webRequest.onAuthRequired.addListener(vpn.surAuth, { urls: ["<all_urls>"] }, [
  "asyncBlocking",
]);
chrome.webRequest.onCompleted.addListener(vpn.surRequeteReussie, { urls: ["<all_urls>"] });
chrome.proxy.onProxyError.addListener((details) => {
  vpn.signalerErreurServeur(details);
});
chrome.runtime.onStartup.addListener(() => vpn.reappliquer());
chrome.runtime.onInstalled.addListener(() => vpn.reappliquer());
