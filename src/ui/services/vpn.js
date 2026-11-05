import { lireAcces, messageErreurVpn } from "../../core/vpn.js";
import { lireProfil } from "../../core/vpnWireguard.js";
import { CHARTE_REFUSEE, CHARTE_VERSION, exigeCharte } from "../../core/vpnCharte.js";
import { demanderCharte as demanderCharteParDefaut } from "../vpn/charte.js";
import { chargerFirebase } from "../../firebase/charger.js";

/**
 * What the VPN settings screen asks of the server (V5.2). Firebase is loaded only when needed.
 * A failure comes back as `{ ok: false, code, erreur }` with a message in French: the screen
 * never handles a raw error. The proxy password only exists in the answer of `obtenirAcces`
 * and `regenerer`: it is not kept here.
 *
 * @param {{ chargerFb?: () => Promise<any> }} options
 */
export function creerServiceVpn({
  chargerFb = chargerFirebase,
  demanderCharte = demanderCharteParDefaut,
} = {}) {
  const appeler = async (nom, donnees) => {
    try {
      const fb = await chargerFb();
      return { ok: true, valeur: await fb.appelerVpn(nom, donnees) };
    } catch (e) {
      return { ok: false, code: e?.code ?? null, erreur: messageErreurVpn(e), message: e?.message };
    }
  };
  /**
   * V5.10: calls a guest function; when the server asks for the charter, shows it once, records
   * the acceptance and calls again. Refusing leaves the VPN unused (nothing is activated).
   */
  const avecCharte = async (nom) => {
    const r = await appeler(nom, {});
    if (!exigeCharte(r)) return r;
    if (!(await demanderCharte())) return { ok: false, code: "charte", erreur: CHARTE_REFUSEE };
    const a = await appeler("vpnAccepterCharte", { version: CHARTE_VERSION });
    return a.ok ? appeler(nom, {}) : a;
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
      const r = await avecCharte("vpnObtenirAcces");
      return r.ok ? { ok: true, valeur: lireAcces(r.valeur) } : r;
    },
    /** V5.8: { ok: true, valeur: { config, nomProfil, pays } }. The key is not kept here. */
    async profil() {
      const r = await avecCharte("vpnObtenirProfilWireGuard");
      if (!r.ok) {
        // "En préparation" is a message written by our own function: shown as it is.
        const direct = r.code === "functions/failed-precondition" && r.message;
        return direct ? { ...r, erreur: r.message } : r;
      }
      const profil = lireProfil(r.valeur);
      return profil
        ? { ok: true, valeur: profil }
        : { ok: false, erreur: "Profil indisponible pour l'instant." };
    },
    recreerProfil: () => appeler("vpnRecreerProfil", {}),
    /** V5.9: { ok: true, valeur: { octets, limiteGo, pourcent, alerte, suspendu, joursRestants } } */
    consommation: () => appeler("vpnMaConsommation", {}),
    /** Owner: { invites: [...], serveur: {...}, mois } — volumes only. */
    tableau: () => appeler("vpnTableauConsommation", {}),
    definirLimite: (email, limiteGo) => appeler("vpnDefinirLimite", { email, limiteGo }),
    couper: (email) => appeler("vpnCouper", { email }),
    retablir: (email) => appeler("vpnRetablir", { email }),
    coupureSecurite: (active) => appeler("vpnCoupureSecurite", { active }),
    initialiserSurveillance: () => appeler("vpnInitialiserSurveillance", {}),
    regenererTous: () => appeler("vpnRegenererTous", {}),
    recreerTousProfils: () => appeler("vpnRecreerTousProfils", {}),
    async regenerer() {
      const r = await appeler("vpnRegenererMotDePasse", {});
      return r.ok ? { ok: true, valeur: lireAcces(r.valeur) } : r;
    },
  };
}
