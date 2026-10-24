import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";

/**
 * Account state for the interface. A small indicator kept in local storage tells, at
 * startup, whether a user was signed in: without it Firebase is never loaded (new tabs stay
 * as fast as in V1); with it the avatar shows at once and Firebase restores the session in
 * the background, without any window.
 *
 * etat: { statut: "deconnecte" | "connexion" | "connecte", profil, erreur }
 */
export function creerCompte({ charger = chargerFirebase, plat = plateforme } = {}) {
  let etat = { statut: "deconnecte", profil: null, erreur: null };
  const abonnes = new Set();
  const changer = (suivant) => {
    etat = { ...etat, ...suivant };
    abonnes.forEach((f) => f(etat));
  };
  const jetons = {
    obtenirJeton: (interactif) => plat.obtenirJetonGoogle(interactif),
    oublierJeton: (token) => plat.oublierJetonGoogle(token),
  };
  let ecoute = null;

  const ecrireIndicateur = (profil) =>
    plat.preferences.ecrire("compte", profil ? { connecte: true, ...profil } : null);

  /** Follows Firebase's session once it is loaded. */
  async function suivreSession() {
    if (ecoute) return;
    const fb = await charger();
    ecoute = fb.ecouterUtilisateur((profil) => {
      if (profil) {
        ecrireIndicateur(profil);
        changer({ statut: "connecte", profil, erreur: null });
      } else if (etat.statut !== "connexion") {
        ecrireIndicateur(null);
        changer({ statut: "deconnecte", profil: null });
      }
    });
  }

  return {
    lire: () => etat,
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    async demarrer() {
      const indicateur = await plat.preferences.lire("compte").catch(() => null);
      if (!indicateur?.connecte) return; // never signed in: Firebase stays unloaded
      const profil = { ...indicateur };
      delete profil.connecte;
      changer({ statut: "connecte", profil });
      suivreSession().catch((e) => changer({ erreur: e.message }));
    },
    async connecter() {
      changer({ statut: "connexion", erreur: null });
      try {
        const fb = await charger();
        const profil = await fb.connecter(jetons);
        await ecrireIndicateur(profil);
        changer({ statut: "connecte", profil, erreur: null });
        suivreSession();
        return profil;
      } catch (e) {
        if (e instanceof plat.ConnexionAnnulee) {
          changer({ statut: "deconnecte", erreur: null }); // closed by the user: nothing to say
        } else if (e instanceof plat.ConnexionIndisponible) {
          changer({
            statut: "deconnecte",
            erreur: "La connexion n'est disponible que dans Google Chrome pour l'instant.",
          });
        } else {
          changer({ statut: "deconnecte", erreur: "La connexion a échoué. Réessayez." });
          console.error(e);
        }
        return null;
      }
    },
    async deconnecter() {
      const fb = await charger();
      await fb.deconnecter(jetons);
      await ecrireIndicateur(null);
      changer({ statut: "deconnecte", profil: null, erreur: null });
    },
  };
}
