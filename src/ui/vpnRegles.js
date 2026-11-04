import { reglesVpnDe } from "../core/domainesVpn.js";

/**
 * V5.6: keeps the extension's proxy in line with the synced per-site rules (also when they come
 * from another computer): the page that holds the state tells the VPN module, which sets the
 * proxy again if the VPN is on. Returns the function that stops following.
 *
 * @param {import("../core/store.js").Store} store
 * @param {{ definirRegles: (r: object) => Promise<void> }} vpn
 */
export function suivreReglesVpn(store, vpn) {
  let dernier = null;
  const pousser = () => {
    const regles = reglesVpnDe(store.lire().reglages);
    const json = JSON.stringify(regles);
    if (json === dernier) return;
    dernier = json;
    vpn.definirRegles(regles).catch(() => {});
  };
  pousser();
  return store.abonner(pousser);
}
