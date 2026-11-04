/**
 * V5.8: what a guest can do with his own WireGuard profile (without Firebase around, like
 * fonctions.js). The configuration holds a PRIVATE KEY: it is decrypted here for the guest only,
 * never written to a log, and the answer is the only place it travels.
 *
 * vpn/config/profils/{uid}   { nomProfil, configChiffree, creeLe, version, aRecreer? }
 */
import { dechiffrer } from "../chiffrement.js";
import { ErreurVpn, MESSAGE_RESERVE } from "./fonctions.js";

export const QUOTA_PROFIL_PAR_JOUR = 10;
export const MESSAGE_EN_PREPARATION = "Votre profil est en préparation, réessayez dans une minute.";

export function creerProfilInvite({
  db,
  cle,
  consommer,
  journal = () => {},
  maintenant = Date.now,
}) {
  const lire = async (chemin) => {
    const s = await db.doc(chemin).get();
    return s.exists ? s.data() : null;
  };

  /** Verified e-mail and an active access, else the usual "reserved" refusal. */
  async function exigerInvite(auth) {
    if (auth?.token?.email_verified !== true)
      throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
    const acces = await lire(`vpn/config/acces/${auth.uid}`);
    if (!acces || acces.actif !== true) throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
    return acces;
  }

  async function limiter(uid) {
    try {
      await consommer(uid, { limite: QUOTA_PROFIL_PAR_JOUR, document: "quotaVpnProfil" });
    } catch (e) {
      if (e?.limite !== undefined)
        throw new ErreurVpn(
          "resource-exhausted",
          "Trop de demandes aujourd'hui, réessayez demain.",
        );
      throw e;
    }
  }

  return {
    /** → { config, nomProfil, pays } ; "en préparation" while the agent has not deposited it. */
    async obtenir(auth) {
      await exigerInvite(auth);
      await limiter(auth.uid);
      const profil = await lire(`vpn/config/profils/${auth.uid}`);
      if (!profil?.configChiffree || profil.aRecreer === true)
        throw new ErreurVpn("failed-precondition", MESSAGE_EN_PREPARATION);
      const c = await lire("vpn/config");
      // Date only: never the configuration, never who.
      journal({ profilRecupere: true, le: maintenant() });
      return {
        config: dechiffrer(profil.configChiffree, cle(), auth.uid),
        nomProfil: profil.nomProfil,
        pays: c?.pays ?? null,
      };
    },

    /**
     * The guest asks for a new profile (lost phone, profile shared by mistake). The agent deletes
     * the old client (its configuration stops working) and creates another one.
     */
    async recreer(auth) {
      await exigerInvite(auth);
      await limiter(auth.uid);
      await db.doc(`vpn/config/profils/${auth.uid}`).set({ aRecreer: true }, { merge: true });
      journal({ profilARecreer: true, le: maintenant() });
      return { ok: true };
    },
  };
}
