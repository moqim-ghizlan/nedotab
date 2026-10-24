import { A, reduire } from "../../core/actions.js";
import { etatInitial, genererIdParDefaut } from "../../core/modele.js";
import { compter, fusionnerImport, grillesIdentiques } from "../../core/fusion.js";
import { etatIndicateur } from "../../core/etatSynchro.js";
import { migrer } from "../../core/migration.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";

/** CLAUDE.md: never one Firestore write per action — 1.5 s after the last change. */
export const DELAI_ECRITURE_MS = 1500;

const DEBUG = import.meta.env.DEV;
const journal = (...a) => DEBUG && console.debug(`[synchro ${new Date().toISOString()}]`, ...a);

/**
 * Account synchronisation: the first contact between the local grid and the account (V2.3),
 * then live sync (V2.4): local changes are written online 1.5 s after the last one, and the
 * account's document is listened to (onSnapshot) to receive the other devices' changes.
 * statut: "synchronise" | "attente" | "hors-ligne" | "erreur" (see core/etatSynchro.js).
 *
 * mode "local": as in V1. mode "compte": the account is the reference; local storage is a
 * cache. A safety copy of the local state is written before any step, never overwritten.
 *
 * @param {{ demanderChoix: (resume) => Promise<"compte"|"local"|"fusion"|null>,
 *           informer: (message, options?) => void }} options
 */
export function creerSynchro({
  store,
  compte,
  demanderChoix,
  informer = () => {},
  charger = chargerFirebase,
  plat = plateforme,
  delai = DELAI_ECRITURE_MS,
  lireMajLocale = async () => null,
}) {
  let etat = { mode: "local", enCours: false, erreur: null, uid: null };
  const abonnes = new Set();
  const changer = (s) => {
    etat = { ...etat, ...s };
    abonnes.forEach((f) => f(etat));
  };
  let minuteur = null;
  let revision = 0; // highest revision written or seen: new writes go above it
  let fb = null;
  let appareil = null;
  let enAttente = []; // local actions not yet handed to Firestore
  let nonConfirmees = 0; // writes handed to Firestore, not yet confirmed by the server
  let arreterEcoute = null;
  let ecritures = 0;
  let enLigne = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  let depuisCache = false;
  let erreurEcriture = null;

  /** Badge state from the network, the cache and the writes in progress. */
  const majStatut = () => {
    if (etat.mode !== "compte") return;
    const statut = etatIndicateur({
      enLigne,
      depuisCache,
      enAttente: enAttente.length > 0 || nonConfirmees > 0,
      erreur: !!erreurEcriture,
    });
    if (statut !== etat.statut || erreurEcriture !== etat.erreur) {
      changer({ statut, erreur: erreurEcriture });
    }
  };

  const messageErreur = (e) =>
    e?.code === "permission-denied"
      ? "Accès refusé par le compte : reconnectez-vous."
      : e?.code === "resource-exhausted"
        ? "Limite d'utilisation atteinte pour aujourd'hui."
        : "Synchronisation impossible pour l'instant";

  /**
   * Hands the current state to Firestore. With the persistent cache the write is kept in
   * IndexedDB and sent when the network allows it, even after Chrome was closed: it is not
   * awaited before handing the next one.
   */
  const ecrire = () => {
    minuteur = null;
    if (etat.mode !== "compte" || enAttente.length === 0) return;
    enAttente = [];
    nonConfirmees++;
    ecritures++;
    fb.ecrireDocument(etat.uid, store.lire(), appareil, ++revision)
      .then(() => {
        erreurEcriture = null;
      })
      .catch((e) => {
        journal("écriture refusée", e);
        erreurEcriture = messageErreur(e);
        enAttente.push({ type: "REPRISE" }); // rewritten on retry
      })
      .finally(() => {
        nonConfirmees--;
        if (enAttente.length === 0 && nonConfirmees === 0) {
          plat.preferences.ecrire("synchroEnAttente", false);
        }
        majStatut();
      });
    majStatut();
  };
  function planifier() {
    clearTimeout(minuteur);
    minuteur = setTimeout(ecrire, delai);
  }
  const ecrireMaintenant = () => {
    if (!minuteur) return;
    clearTimeout(minuteur);
    ecrire();
  };
  // Only local actions are sent (debounced). Loads — from the storage, another tab or
  // another device — never trigger a write: no ping-pong between devices.
  store.abonner((_e, action) => {
    if (etat.mode !== "compte" || action.type === A.CHARGER) return;
    // Remembered on this device until the server confirms: the next start sends the local
    // state before listening if a write could not even be handed to Firestore.
    if (enAttente.length === 0) plat.preferences.ecrire("synchroEnAttente", true);
    enAttente.push(action);
    majStatut();
    planifier();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", ecrireMaintenant);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") ecrireMaintenant();
    });
    window.addEventListener("online", () => ((enLigne = true), majStatut()));
    window.addEventListener("offline", () => ((enLigne = false), majStatut()));
  }

  /** A change of the account's document, from this device or another one. */
  const recevoir = (brut, { ecritureEnAttente, depuisCache: cache = false }) => {
    depuisCache = cache;
    majStatut();
    if (ecritureEnAttente || !brut) return; // our own write, not yet confirmed
    if (Number.isInteger(brut.revision)) {
      if (brut.majPar === appareil && brut.revision <= revision) return; // echo
      revision = Math.max(revision, brut.revision);
    }
    const { etat: distant, lectureSeule } = migrer(brut);
    if (lectureSeule) {
      erreurEcriture = "Données du compte d'une version plus récente : mettez à jour NedoTab.";
      majStatut();
      return;
    }
    // Local changes not yet handed to Firestore are replayed on top: nothing is lost.
    let suivant = { ...distant, reglagesAppareil: store.lire().reglagesAppareil };
    for (const action of enAttente) suivant = reduire(suivant, action);
    const courant = store.lire();
    if (
      grillesIdentiques(courant.grille, suivant.grille) &&
      JSON.stringify(courant.reglages) === JSON.stringify(suivant.reglages)
    ) {
      return; // same state (e.g. already received from another tab): no re-render
    }
    journal("changement reçu", brut.majPar, brut.revision);
    store.envoyer({ type: A.CHARGER, etat: suivant, origine: "distant" });
  };

  const ecouter = () => {
    arreterEcoute?.();
    arreterEcoute = fb.ecouterDocument(etat.uid, recevoir, (e) => {
      journal("écoute interrompue", e);
      erreurEcriture = messageErreur(e);
      majStatut();
    });
  };

  const passerEnCompte = async (uid) => {
    await plat.preferences.ecrire("synchro", { uid });
    changer({ mode: "compte", uid, erreur: null, statut: "synchronise" });
    ecouter();
  };

  const appliquer = (source) =>
    store.envoyer({ type: A.SYNCHRO_APPLIQUER, grille: source.grille, reglages: source.reglages });

  return {
    lire: () => etat,
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    /** At startup: resume the account mode if it was on for the signed-in user. */
    async demarrer() {
      const pref = await plat.preferences.lire("synchro").catch(() => null);
      const profil = compte.lire().profil;
      if (!pref?.uid || pref.uid !== profil?.uid) return;
      fb = await charger();
      appareil = await plat.idAppareil();
      changer({ mode: "compte", uid: pref.uid, statut: "synchronise" });
      if (await plat.preferences.lire("synchroEnAttente").catch(() => false)) {
        // The last local changes may not have been sent: send them first, so that the
        // (older) online state does not replace them.
        enAttente = [{ type: "REPRISE" }];
        ecrire();
      }
      ecouter();
    },

    /** After an error: listen again and send what is pending. */
    reessayer() {
      if (etat.mode !== "compte") return this.lancerPremiereSynchro();
      erreurEcriture = null;
      majStatut();
      ecouter();
      if (enAttente.length) planifier();
    },

    /** Number of writes since the page opened (cost measurements). */
    statistiques: () => ({
      ecritures,
      enAttente: enAttente.length,
      nonConfirmees,
      minuteur: minuteur !== null,
      revision,
    }),

    /** Local changes not yet confirmed by the server (sign-out warning). */
    modificationsNonEnvoyees: () => enAttente.length + nonConfirmees + (minuteur ? 1 : 0),

    /**
     * First synchronisation (at sign-in, or on demand). Never leaves a half state:
     * on any error the app stays in local mode with its data untouched.
     * @returns {Promise<"cree"|"envoye"|"recupere"|"identique"|"compte"|"local"|"fusion"|"annule"|"erreur"|"occupe">}
     */
    async lancerPremiereSynchro() {
      if (etat.enCours) return "occupe"; // two clicks on "Se connecter"
      const uid = compte.lire().profil?.uid;
      if (!uid) return "annule";
      changer({ enCours: true, erreur: null });
      try {
        const local = store.lire();
        await plat.copies.enregistrer(local);
        fb = await charger();
        appareil = await plat.idAppareil();
        const lu = await fb.lireDocument(uid);
        const distant = lu ? migrer(lu.brut) : null;
        if (distant?.lectureSeule) {
          changer({
            erreur:
              "Les données du compte viennent d'une version plus récente : mettez à jour NedoTab.",
          });
          return "erreur";
        }
        const localVide = local.grille.length === 0;
        const distantVide = !distant || distant.etat.grille.length === 0;
        let issue;
        if (distantVide) {
          // Nothing online: this device's state becomes the account's.
          await fb.ecrireDocument(uid, local, appareil, ++revision);
          issue = localVide ? "cree" : "envoye";
        } else if (localVide) {
          appliquer(distant.etat);
          issue = "recupere";
        } else if (grillesIdentiques(local.grille, distant.etat.grille)) {
          issue = "identique";
        } else {
          const choix = await demanderChoix({
            local: { ...compter(local.grille), majLe: await lireMajLocale(), grille: local.grille },
            compte: {
              ...compter(distant.etat.grille),
              majLe: lu.majLe,
              grille: distant.etat.grille,
            },
          });
          journal("choix", choix);
          if (!choix) return "annule";
          if (choix === "compte") {
            appliquer(distant.etat);
          } else if (choix === "local") {
            await fb.sauvegarderAvantRemplacement(uid, distant.etat, appareil);
            await fb.ecrireDocument(uid, local, appareil, ++revision);
          } else {
            const { grille, ajoutes, aplati } = fusionnerImport(distant.etat.grille, local.grille, {
              dossierId: genererIdParDefaut(),
            });
            appliquer({ grille, reglages: distant.etat.reglages });
            await fb.ecrireDocument(uid, store.lire(), appareil, ++revision);
            if (aplati)
              informer("Certains dossiers trop profonds ont été aplatis pour respecter 3 niveaux.");
            journal("fusion", ajoutes);
          }
          issue = choix;
        }
        await passerEnCompte(uid);
        const n = compter(store.lire().grille).sites;
        informer(`Vos ${n} site${n > 1 ? "s sont" : " est"} maintenant sur votre compte`);
        journal("première synchro", issue);
        return issue;
      } catch (e) {
        journal("échec", e);
        changer({ mode: "local", erreur: "Synchronisation impossible pour l'instant" });
        return "erreur";
      } finally {
        changer({ enCours: false });
      }
    },

    /**
     * Sign-out: back to local mode with the last known grid, or an empty one when the user
     * does not want to keep a copy on this computer (shared computer).
     */
    async quitter({ garderCopie }) {
      clearTimeout(minuteur);
      if (etat.mode === "compte" && minuteur !== null) ecrire();
      minuteur = null;
      arreterEcoute?.();
      arreterEcoute = null;
      enAttente = [];
      await plat.preferences.ecrire("synchro", null);
      changer({ mode: "local", uid: null, erreur: null, statut: null });
      if (!garderCopie) {
        await plat.copies.enregistrer(store.lire());
        appliquer(etatInitial());
        // Firestore's own cache holds the account's data too: erase it on a shared computer.
        // Firestore is stopped by this: the page reloads after the sign-out.
        await fb?.effacerCache?.().catch((e) => journal("effacement du cache", e));
      }
    },

    /** Restores the most recent safety copy of this computer. */
    async restaurerCopie() {
      const [copie] = await plat.copies.lister();
      if (!copie) return false;
      const { etat: restaure } = migrer(copie.etat);
      appliquer(restaure);
      return true;
    },
  };
}
