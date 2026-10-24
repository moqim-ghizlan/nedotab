import { empreinte } from "../../core/empreinte.js";
import {
  AUTO_MAX,
  doitSauvegarder,
  MANUELLES_MAX,
  VERIFICATION_MS,
} from "../../core/sauvegardes.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";

/**
 * Account backups (V2.7). The automatic one is checked at most once an hour per device
 * (the last check is kept locally, so ten tabs do not run ten queries) and made at most
 * once a day, never for an empty grid nor for a grid identical to the last one.
 */
export function creerSauvegardes({ store, session, charger = chargerFirebase, plat = plateforme }) {
  const uid = () => session.compte.lire().profil?.uid;
  const enCompte = () => session.synchro.lire().mode === "compte" && !!uid();

  /** @returns {Promise<"cree"|"inutile"|"plus-tard"|"local">} */
  async function verifierAuto({ forcer = false, maintenant = Date.now() } = {}) {
    if (!enCompte()) return "local";
    const memo = (await plat.preferences.lire("sauvegardeAuto").catch(() => null)) ?? {};
    if (!forcer && memo.verifieLe && maintenant - memo.verifieLe < VERIFICATION_MS)
      return "plus-tard";
    const fb = await charger();
    const etat = store.lire();
    const actuelle = empreinte(etat);
    const derniere = forcer ? null : await fb.derniereAuto(uid());
    const faire =
      forcer ||
      doitSauvegarder({
        etat,
        derniereAuto: derniere,
        empreinteDerniere: memo.empreinte,
        empreinteActuelle: actuelle,
        maintenant,
      });
    if (!faire) {
      await plat.preferences.ecrire("sauvegardeAuto", { ...memo, verifieLe: maintenant });
      return "inutile";
    }
    await fb.creerSauvegarde(uid(), etat, { type: "auto" });
    await fb.rotation(uid(), "auto", AUTO_MAX);
    await plat.preferences.ecrire("sauvegardeAuto", { verifieLe: maintenant, empreinte: actuelle });
    return "cree";
  }

  /** @returns {Promise<{ ok: true, id: string } | { ok: false, erreur: string }>} */
  async function sauvegarderManuelle(nom) {
    if (!enCompte())
      return { ok: false, erreur: "Connectez-vous pour enregistrer des sauvegardes." };
    const fb = await charger();
    if ((await fb.compterManuelles(uid())) >= MANUELLES_MAX) {
      return {
        ok: false,
        erreur: `Vous avez déjà ${MANUELLES_MAX} sauvegardes manuelles : supprimez-en une pour en créer une autre.`,
      };
    }
    const id = await fb.creerSauvegarde(uid(), store.lire(), { type: "manuelle", nom });
    return { ok: true, id };
  }

  return { verifierAuto, sauvegarderManuelle, enCompte, uid, charger };
}
