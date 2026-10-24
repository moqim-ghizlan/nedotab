import { A } from "../../core/actions.js";
import { etatInitial, genererIdParDefaut } from "../../core/modele.js";
import { compter, fusionnerImport, grillesIdentiques } from "../../core/fusion.js";
import { migrer } from "../../core/migration.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";

/** CLAUDE.md: never one Firestore write per action — 1.5 s after the last change. */
export const DELAI_ECRITURE_MS = 1500;

const DEBUG = import.meta.env.DEV;
const journal = (...a) => DEBUG && console.debug(`[synchro ${new Date().toISOString()}]`, ...a);

/**
 * Account synchronisation, V2.3: the first contact between the local grid and the account,
 * then every local change is also written online (debounced). Receiving other devices'
 * changes comes in V2.4.
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
  let revision = 0;
  let fb = null;
  let appareil = null;

  const ecrire = async () => {
    minuteur = null;
    if (etat.mode !== "compte") return;
    try {
      await fb.ecrireDocument(etat.uid, store.lire(), appareil, ++revision);
      if (etat.erreur) changer({ erreur: null });
    } catch (e) {
      journal("écriture refusée", e);
      changer({ erreur: "Synchronisation impossible pour l'instant" });
    }
  };
  const planifier = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(ecrire, delai);
  };
  // Every local change is sent (debounced); loads from storage or other tabs are not.
  store.abonner((_e, action) => {
    if (etat.mode === "compte" && action.type !== A.CHARGER) planifier();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      if (minuteur) {
        clearTimeout(minuteur);
        ecrire();
      }
    });
  }

  const passerEnCompte = async (uid) => {
    await plat.preferences.ecrire("synchro", { uid });
    changer({ mode: "compte", uid, erreur: null });
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
      changer({ mode: "compte", uid: pref.uid });
    },

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
      if (etat.mode === "compte" && minuteur !== null) await ecrire();
      minuteur = null;
      await plat.preferences.ecrire("synchro", null);
      changer({ mode: "local", uid: null, erreur: null });
      if (!garderCopie) {
        await plat.copies.enregistrer(store.lire());
        appliquer(etatInitial());
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
