import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";

/**
 * Account state for the interface. A small indicator kept in local storage tells, at
 * startup, whether a user was signed in: without it Firebase is never loaded (new tabs stay
 * as fast as in V1); with it the avatar shows at once and Firebase restores the session in
 * the background, without any window.
 *
 * Web app (V3.2): signing in leaves the page for Google. A marker written just before
 * ("connexionEnAttente") tells the next startup to load Firebase and read the result.
 *
 * etat: { statut: "deconnecte" | "connexion" | "connecte", profil, erreur }
 */

/** A redirect older than this was abandoned (the user never came back from Google). */
const ATTENTE_MAX_MS = 10 * 60 * 1000;

/** Readable message for a failed sign-in (Firebase error codes). */
function messageErreur(e) {
  if (e?.code === "auth/user-mismatch") return "Choisissez le même compte Google pour confirmer.";
  if (e?.code === "auth/network-request-failed")
    return "Pas de connexion à Internet. Réessayez une fois en ligne.";
  if (e?.code === "auth/unauthorized-domain")
    return "La connexion n'est pas autorisée sur cette adresse.";
  return "La connexion a échoué. Réessayez.";
}

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
  const parRedirection = plat.capacites?.connexion === "redirection";
  /** Before leaving for Google: what to do on the way back ("connexion" | "confirmation"). */
  const marquerAttente = (but) =>
    parRedirection
      ? plat.preferences.ecrire("connexionEnAttente", { but, le: Date.now() })
      : Promise.resolve();
  const effacerAttente = () =>
    parRedirection ? plat.preferences.ecrire("connexionEnAttente", null) : Promise.resolve();

  /**
   * Back from Google (web app): reads the result of the redirect.
   * @returns {Promise<"connexion"|"confirmation"|null>} what was finished, null otherwise
   */
  async function terminerRedirection(attente) {
    await effacerAttente();
    if (!attente || Date.now() - attente.le > ATTENTE_MAX_MS) return null;
    const avant = etat;
    if (attente.but === "connexion") changer({ statut: "connexion", erreur: null });
    try {
      const fb = await charger();
      const profil = await fb.terminerConnexion();
      if (!profil) {
        changer(avant); // came back without signing in: nothing to say
        return null;
      }
      await ecrireIndicateur(profil);
      changer({ statut: "connecte", profil, erreur: null });
      return attente.but;
    } catch (e) {
      changer({ ...avant, erreur: messageErreur(e) });
      console.error(e);
      return null;
    }
  }

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
    /** @returns {Promise<"connexion"|"confirmation"|null>} a redirect finished at startup */
    async demarrer() {
      const indicateur = await plat.preferences.lire("compte").catch(() => null);
      if (indicateur?.connecte) {
        const profil = { ...indicateur };
        delete profil.connecte;
        changer({ statut: "connecte", profil });
      }
      const attente = parRedirection
        ? await plat.preferences.lire("connexionEnAttente").catch(() => null)
        : null;
      if (attente) {
        const fini = await terminerRedirection(attente);
        if (etat.statut === "connecte")
          suivreSession().catch((e) => changer({ erreur: e.message }));
        return fini;
      }
      if (!indicateur?.connecte) return null; // never signed in: Firebase stays unloaded
      suivreSession().catch((e) => changer({ erreur: e.message }));
      return null;
    },
    async connecter() {
      changer({ statut: "connexion", erreur: null });
      try {
        const fb = await charger();
        await marquerAttente("connexion");
        const profil = await fb.connecter(jetons); // web app: the page leaves for Google
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
          changer({ statut: "deconnecte", erreur: messageErreur(e) });
          console.error(e);
        }
        await effacerAttente();
        return null;
      }
    },
    async deconnecter() {
      const fb = await charger();
      await fb.deconnecter(jetons);
      await ecrireIndicateur(null);
      changer({ statut: "deconnecte", profil: null, erreur: null });
    },
    /**
     * Signs in again with Google (V2.10: a recent sign-in confirms the account deletion).
     * @returns {Promise<boolean>} false when the window was closed or the sign-in failed
     */
    async reconnecter() {
      try {
        const fb = await charger();
        await marquerAttente("confirmation");
        // Web app: a recent sign-in answers at once, otherwise the page leaves for Google.
        const profil = await fb.reconnecterPourConfirmer(jetons);
        await effacerAttente();
        return profil?.uid === etat.profil?.uid;
      } catch (e) {
        await effacerAttente();
        if (!(e instanceof plat.ConnexionAnnulee)) console.error(e);
        return false;
      }
    },
    /** After the account was deleted on the server: forget the session on this device. */
    async oublier() {
      const fb = await charger();
      await fb.deconnecter(jetons).catch(() => {});
      await ecrireIndicateur(null);
      changer({ statut: "deconnecte", profil: null, erreur: null });
    },
  };
}
