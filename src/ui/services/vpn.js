import { lireAcces, messageErreurVpn } from "../../core/vpn.js";
import { chargerFirebase } from "../../firebase/charger.js";

/**
 * What the VPN settings screen asks of the server (V5.2). Firebase is loaded only when needed.
 * A failure comes back as `{ ok: false, code, erreur }` with a message in French: the screen
 * never handles a raw error. The proxy password only exists in the answer of `obtenirAcces`
 * and `regenerer`: it is not kept here.
 *
 * @param {{ chargerFb?: () => Promise<any> }} options
 */
export function creerServiceVpn({ chargerFb = chargerFirebase } = {}) {
  const appeler = async (nom, donnees) => {
    try {
      const fb = await chargerFb();
      return { ok: true, valeur: await fb.appelerVpn(nom, donnees) };
    } catch (e) {
      return { ok: false, code: e?.code ?? null, erreur: messageErreurVpn(e) };
    }
  };
  return {
    async estAdmin() {
      try {
        return (await chargerFb()).estAdminVpn();
      } catch {
        return false;
      }
    },
    inviter: (email) => appeler("vpnInviter", { email }),
    revoquer: (emailOuUid) => appeler("vpnRevoquer", { emailOuUid }),
    invites: () => appeler("vpnListeInvites", {}),
    /** { ok: true, valeur: { domaine, port, compte, motDePasse, pays } | null } */
    async acces() {
      const r = await appeler("vpnObtenirAcces", {});
      return r.ok ? { ok: true, valeur: lireAcces(r.valeur) } : r;
    },
    async regenerer() {
      const r = await appeler("vpnRegenererMotDePasse", {});
      return r.ok ? { ok: true, valeur: lireAcces(r.valeur) } : r;
    },
  };
}
