/**
 * V5.10: rotation of the VPN secrets (without Firebase around, like fonctions.js).
 *  - regenererTous      every guest gets a new proxy password (extensions fetch it on first refusal)
 *  - recreerTousProfils every WireGuard profile is recreated (each friend imports it again):
 *                       only after a compromise
 *  - migrerCle          re-encrypts the proxy passwords and the WireGuard profiles with a new
 *                       VPN_CLE_CHIFFREMENT (run once, from the owner's computer: see docs/rotation.md)
 * Never a secret in a log.
 */
import { chiffrer, dechiffrer } from "../chiffrement.js";
import { ErreurVpn } from "./fonctions.js";
import { empreinteBcrypt, genererMotDePasse } from "./identifiants.js";
import { monterVersion } from "./version.js";

export function creerRotationVpn({
  db,
  cle,
  maintenant = () => Date.now(),
  cout,
  journal = () => {},
}) {
  const exigerAdmin = (auth) => {
    if (auth?.token?.admin !== true)
      throw new ErreurVpn("permission-denied", "Action réservée à l'administrateur.");
  };

  return {
    async regenererTous(auth) {
      exigerAdmin(auth);
      const acces = await db.collection("vpn/config/acces").get();
      let n = 0;
      for (const d of acces.docs) {
        const a = d.data();
        if (a.actif !== true || a.technique === true) continue;
        const motDePasse = genererMotDePasse();
        await db.doc(`vpn/config/acces/${d.id}`).set(
          {
            empreinte: empreinteBcrypt(motDePasse, cout),
            motDePasseChiffre: chiffrer(motDePasse, cle(), d.id),
          },
          { merge: true },
        );
        n += 1;
      }
      if (n) await monterVersion(db, maintenant);
      journal({ motsDePasseRegeneres: n });
      return { ok: true, comptes: n };
    },

    async recreerTousProfils(auth) {
      exigerAdmin(auth);
      const acces = await db.collection("vpn/config/acces").get();
      let n = 0;
      for (const d of acces.docs) {
        if (d.data().actif !== true || d.data().technique === true) continue;
        await db.doc(`vpn/config/profils/${d.id}`).set({ aRecreer: true }, { merge: true });
        n += 1;
      }
      journal({ profilsARecreer: n });
      return { ok: true, profils: n };
    },
  };
}

/**
 * Re-encrypts everything that was encrypted with `ancienne` using `nouvelle` (AAD = uid).
 * A document that cannot be decrypted with the old key is left as it is and counted as failed:
 * nothing is overwritten with garbage.
 * @returns {Promise<{ motsDePasse: number, profils: number, echecs: number }>}
 */
export async function migrerCle(db, ancienne, nouvelle) {
  if (!ancienne || !nouvelle || ancienne === nouvelle)
    throw new Error("Deux clés différentes sont nécessaires.");
  const bilan = { motsDePasse: 0, profils: 0, echecs: 0 };
  const rechiffrer = async (chemin, champ, uid) => {
    const snap = await db.doc(chemin).get();
    if (!snap.exists || !snap.data()[champ]) return;
    try {
      const clair = dechiffrer(snap.data()[champ], ancienne, uid);
      await db.doc(chemin).set({ [champ]: chiffrer(clair, nouvelle, uid) }, { merge: true });
      return true;
    } catch {
      bilan.echecs += 1;
      return false;
    }
  };
  for (const d of (await db.collection("vpn/config/acces").get()).docs) {
    if (await rechiffrer(`vpn/config/acces/${d.id}`, "motDePasseChiffre", d.id))
      bilan.motsDePasse += 1;
  }
  for (const d of (await db.collection("vpn/config/profils").get()).docs) {
    if (await rechiffrer(`vpn/config/profils/${d.id}`, "configChiffree", d.id)) bilan.profils += 1;
  }
  return bilan;
}
