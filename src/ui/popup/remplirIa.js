import { fusionnerPropositionIa } from "../../core/ajoutRapide.js";
import { plateforme } from "../../platform/index.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { messageErreurIa } from "../messagesIa.js";

/**
 * "Remplir avec l'IA" (V4.29): one click = one call to iaProposerSite, never at opening.
 * The result fills ONLY the fields the user has not touched; nothing is saved here.
 * @param {object} d
 * @param {() => object} d.formulaire current values { titre, tags, description, dossierId }
 * @param {() => Set<string>} d.touches fields edited by hand
 * @param {() => object} d.grille
 * @param {{ url: string, titre: string }} d.onglet
 * @param {(f: object, remplis: string[]) => void} d.appliquer
 * @param {(etat: "attente"|"ok"|"erreur", message?: string) => void} d.surEtat
 */
export function creerRemplissageIa({
  formulaire,
  touches,
  grille,
  onglet,
  appliquer,
  surEtat,
  charger = chargerFirebase,
}) {
  let controleur = null;
  let sequence = 0;
  return {
    async lancer() {
      const mienne = ++sequence;
      controleur = new AbortController();
      surEtat("attente");
      try {
        // Extension with the "read sites" permission: the extract is read here; otherwise the
        // server reads the page (title and address only for a sensitive page).
        const extrait = plateforme.capacites?.lirePagesWeb
          ? ((await plateforme.lireExtrait?.(onglet.url).catch(() => null)) ?? null)
          : null;
        const fb = await charger();
        // A fresh window has not restored the saved session yet: wait for it, or the server
        // sees nobody ("Connectez-vous pour utiliser l'IA").
        await fb.obtenirAuth?.().authStateReady?.();
        const r = await fb.appelerIa("iaProposerSite", {
          url: onglet.url,
          titre: onglet.titre,
          ...(extrait ? { extrait } : {}),
        });
        // Cancelled, or relaunched meanwhile: the answer is ignored.
        if (mienne !== sequence || controleur.signal.aborted) return;
        const { formulaire: f, remplis } = fusionnerPropositionIa(
          formulaire(),
          r,
          touches(),
          grille(),
        );
        appliquer(f, remplis);
        surEtat("ok");
      } catch (e) {
        if (mienne !== sequence) return;
        surEtat("erreur", messageErreurIa(e));
      }
    },
    annuler() {
      sequence++;
      controleur?.abort();
      surEtat("annule");
    },
  };
}
