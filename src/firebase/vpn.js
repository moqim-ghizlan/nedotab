import { httpsCallable } from "firebase/functions";
import { obtenirAuth } from "#auth";
import { obtenirFonctions } from "./fonctions.js";

/** The VPN functions the browser may call (V5.2). The proxy password only ever comes back from them. */
export const FONCTIONS_VPN = [
  "vpnInviter",
  "vpnRevoquer",
  "vpnListeInvites",
  "vpnObtenirAcces",
  "vpnRegenererMotDePasse",
];

/** Calls a VPN function of the server and returns its answer (errors keep their callable code). */
export async function appelerVpn(nom, donnees = {}) {
  if (!FONCTIONS_VPN.includes(nom)) throw new Error(`Fonction VPN inconnue : ${nom}`);
  const r = await httpsCallable(obtenirFonctions(), nom)(donnees);
  return r.data;
}

/**
 * True when the signed-in account carries the "admin" claim. The token is refreshed so that a
 * claim given a moment ago shows up. This only decides what the screen shows: every function
 * checks the claim again on the server.
 */
export async function estAdminVpn() {
  const utilisateur = obtenirAuth().currentUser;
  if (!utilisateur) return false;
  const jeton = await utilisateur.getIdTokenResult(true);
  return jeton.claims.admin === true;
}
