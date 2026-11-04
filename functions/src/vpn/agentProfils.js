/**
 * V5.7: WireGuard profiles of the VPN guests (without Firebase around, like fonctions.js).
 *
 * vpn/config/profils/{uid}   { nomProfil, configChiffree, creeLe, version }
 * The path is under vpn/config (a document path needs an even number of segments), so the
 * browser can neither read nor write it (firestore.rules: vpn/** is closed).
 *
 * The server only ever sees `nomProfil` (random, "p_" + 10 characters): never an e-mail nor a
 * uid. A client configuration holds a PRIVATE KEY: it is stored encrypted (AES-GCM, AAD = uid)
 * and never written to a log.
 */
import { chiffrer } from "../chiffrement.js";
import { secretsEgaux } from "./identifiants.js";
import { randomInt } from "node:crypto";

export const CONFIG_MAX = 8192;
export const FORME_NOM_PROFIL = /^p_[a-z0-9]{10}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const genererNomProfil = () =>
  `p_${Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/** A WireGuard client file: an [Interface] with a key, a [Peer], and nothing else suspicious. */
export function configurationValide(texte) {
  return (
    typeof texte === "string" &&
    texte.length > 0 &&
    texte.length <= CONFIG_MAX &&
    /^\[Interface\]/m.test(texte) &&
    /^PrivateKey\s*=\s*\S+/m.test(texte) &&
    /^\[Peer\]/m.test(texte) &&
    !/^\s*(PreUp|PostUp|PreDown|PostDown)\s*=/im.test(texte)
  );
}

export class ErreurProfil extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function creerProfilsVpn({
  db,
  cle,
  jetonAgent,
  maintenant = () => Date.now(),
  journal = () => {},
}) {
  const acces = "vpn/config/acces";
  const profil = (uid) => `vpn/config/profils/${uid}`;

  return {
    /**
     * What the agent reads: the active guests as { nomProfil } (a neutral name is given to the
     * accesses that have none yet). `null` when the token is wrong (401).
     */
    async lister(jeton) {
      if (!secretsEgaux(jeton, jetonAgent())) return null;
      const snap = await db.collection(acces).where("actif", "==", true).get();
      const profils = [];
      for (const d of snap.docs) {
        let nom = d.data().nomProfil;
        if (!FORME_NOM_PROFIL.test(nom ?? "")) {
          nom = genererNomProfil();
          await db.doc(`${acces}/${d.id}`).set({ nomProfil: nom }, { merge: true });
        }
        // `depose`: a configuration is stored, so the agent need not send it again.
        const stocke = await db.doc(profil(d.id)).get();
        const donnees = stocke.exists ? stocke.data() : {};
        const recreer = donnees.aRecreer === true; // V5.8: the guest asked for a new profile
        const depose = !!donnees.configChiffree && !recreer;
        profils.push({ nomProfil: nom, depose, recreer });
      }
      profils.sort((a, b) => a.nomProfil.localeCompare(b.nomProfil));
      journal({ profils: profils.length });
      return { profils };
    },

    /** The agent deposits the configuration of a profile it just created. Stored encrypted. */
    async deposer(jeton, { nomProfil, configuration } = {}) {
      if (!secretsEgaux(jeton, jetonAgent())) return null;
      if (!FORME_NOM_PROFIL.test(String(nomProfil ?? "")) || !configurationValide(configuration))
        throw new ErreurProfil("invalid-argument", "Profil invalide.");
      const snap = await db
        .collection(acces)
        .where("nomProfil", "==", nomProfil)
        .where("actif", "==", true)
        .get();
      const doc = snap.docs[0];
      if (!doc) throw new ErreurProfil("not-found", "Profil inconnu.");
      const uid = doc.id;
      await db.doc(profil(uid)).set({
        nomProfil,
        configChiffree: chiffrer(configuration, cle(), uid),
        creeLe: maintenant(),
        version: 1,
      });
      journal({ depose: true });
      return { ok: true };
    },

    /** Access revoked or account deleted: the stored profile goes with it. */
    async retirer(uid) {
      await db.doc(profil(uid)).delete();
    },
  };
}
