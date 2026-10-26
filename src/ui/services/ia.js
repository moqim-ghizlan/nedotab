import { normaliserConfigIa } from "../../core/configIa.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { messageErreurIa } from "../messagesIa.js";

/**
 * What the AI settings screen asks of the server (V4.1): the state of the keys, saving and
 * removing a key, testing a model, and config/ia. Firebase is loaded only when needed. A
 * failure comes back as `{ ok: false, erreur: "message in French" }`: the screen never
 * handles a raw error (and the key typed is never kept here).
 *
 * @param {{ chargerFb?: () => Promise<any> }} options
 */
export function creerServiceIa({ chargerFb = chargerFirebase } = {}) {
  const appeler = async (nom, donnees) => {
    try {
      const fb = await chargerFb();
      return { ok: true, valeur: await fb.appelerIa(nom, donnees) };
    } catch (e) {
      return { ok: false, erreur: messageErreurIa(e) };
    }
  };
  return {
    etatCles: () => appeler("iaEtatCles", {}),
    enregistrerCle: (fournisseur, cle) => appeler("iaEnregistrerCle", { fournisseur, cle }),
    supprimerCle: (fournisseur) => appeler("iaSupprimerCle", { fournisseur }),
    tester: (fournisseur, modele) => appeler("iaTester", { fournisseur, modele }),
    /** Models the user's key can use, asked to the provider: [{ id, nom }]. */
    modeles: (fournisseur) => appeler("iaListerModeles", { fournisseur }),
    /** config/ia, or the default when it is missing or unreadable (offline). */
    async config() {
      try {
        const fb = await chargerFb();
        return normaliserConfigIa(await fb.lireConfigIa());
      } catch {
        return normaliserConfigIa(null);
      }
    },
  };
}
