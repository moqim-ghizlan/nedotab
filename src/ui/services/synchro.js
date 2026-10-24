import { A } from "../../core/actions.js";
import { etatInitial, genererIdParDefaut } from "../../core/modele.js";
import { compter, fusionnerImport, grillesIdentiques } from "../../core/fusion.js";
import { etatIndicateur } from "../../core/etatSynchro.js";
import { ajouter, fusionnerFiles, retirerJusqua, validerFile } from "../../core/fileOperations.js";
import { migrer } from "../../core/migration.js";
import { validerReglages } from "../../core/reglages.js";
import { decrire, rejouer } from "../../core/rejeu.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";
import { journal as creerJournal } from "../journal.js";

/** CLAUDE.md: never one Firestore write per action — 1.5 s after the last change. */
export const DELAI_ECRITURE_MS = 1500;
/** Retries after a failed transaction: 1 s, 2 s, 4 s… at most 60 s. */
export const REESSAI_MAX_MS = 60000;

const journal = creerJournal("synchro");

/** Queues kept in memory only (tests, or a platform without persistence). */
const operationsEnMemoire = () => {
  const zone = new Map();
  return {
    ecrire: async (id, v) => void zone.set(id, v),
    supprimer: async (id) => void zone.delete(id),
    toutes: async () => Object.fromEntries(zone),
    surChangement: () => () => {},
  };
};

/**
 * Account synchronisation: the first contact between the local grid and the account (V2.3),
 * then live sync. Since V2.9 every local change is an operation in a queue persisted on this
 * device; 1.5 s after the last one, a transaction reads the account's document, replays the
 * queue on it with the same reducer as the interface and writes the result (revision + 1).
 * Nothing done on another device meanwhile is overwritten; an operation that no longer
 * applies is ignored and reported. The state shown is always the last known server state
 * with the pending operations replayed on top.
 * statut: "synchronise" | "attente" | "hors-ligne" | "erreur" (see core/etatSynchro.js).
 *
 * @param {{ demanderChoix: (resume) => Promise<"compte"|"local"|"fusion"|null>,
 *           informer: (message, options?) => void,
 *           signalerIgnorees?: (ignorees) => void }} options
 */
export function creerSynchro({
  store,
  compte,
  demanderChoix,
  informer = () => {},
  signalerIgnorees = () => {},
  charger = chargerFirebase,
  plat = plateforme,
  delai = DELAI_ECRITURE_MS,
  lireMajLocale = async () => null,
  verrous = globalThis.navigator?.locks,
  idOnglet = globalThis.crypto.randomUUID(),
}) {
  let etat = { mode: "local", enCours: false, erreur: null, uid: null };
  const abonnes = new Set();
  const changer = (s) => {
    etat = { ...etat, ...s };
    abonnes.forEach((f) => f(etat));
  };
  const persistance = plat.operations ?? operationsEnMemoire();
  let minuteur = null;
  let reessai = 0; // delay of the next retry after a failure (0: none failed)
  let revision = 0; // highest revision seen
  let fb = null;
  let appareil = null;
  let file = []; // this tab's operations not yet confirmed by the server
  const autres = new Map(); // queues of the other open tabs (shown, sent by their tab)
  let serveur = null; // last state received from the account
  let revisionServeur = -1; // its revision
  let envoiEnCours = false;
  let arreterEcoute = null;
  let arreterAutres = null;
  let ecritures = 0;
  let enLigne = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  let depuisCache = false;
  let erreurEcriture = null;
  let precedent = store.lire(); // state before the action being queued (descriptions)

  // This tab's queue belongs to it while it is open: a lock held until the page closes
  // tells the next tab whether a queue found in storage is orphaned.
  verrous?.request(`nedotab-onglet:${idOnglet}`, () => new Promise(() => {})).catch(() => {});

  /** Badge state from the network, the cache and the pending operations. */
  const majStatut = () => {
    if (etat.mode !== "compte") return;
    const statut = etatIndicateur({
      enLigne,
      depuisCache,
      enAttente: file.length > 0 || envoiEnCours,
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
        : e?.code === "lecture-seule"
          ? "Données du compte d'une version plus récente : mettez à jour NedoTab."
          : "Synchronisation impossible pour l'instant";

  const persister = () =>
    (file.length
      ? persistance.ecrire(idOnglet, { uid: etat.uid, file })
      : persistance.supprimer(idOnglet)
    ).catch((e) => journal("file non enregistrée", e));

  /** What the transaction writes: the account's document with the operations replayed. */
  const calculer = (brut, lot) => {
    const base = brut ? migrer(brut) : { etat: etatInitial(), lectureSeule: false };
    if (base.lectureSeule)
      throw Object.assign(new Error("lecture seule"), { code: "lecture-seule" });
    const r = rejouer(base.etat, lot);
    return { etat: r.etat, ignorees: r.ignorees, revision: (brut?.revision ?? 0) + 1 };
  };

  /**
   * Sends this tab's queue in one transaction. Never offline (a transaction needs the
   * server): the queue waits for the network. The queue is only emptied once confirmed.
   */
  const envoyer = async () => {
    minuteur = null;
    if (etat.mode !== "compte" || file.length === 0 || envoiEnCours || !fb) return;
    if (!enLigne) return majStatut(); // sent again on "online"
    envoiEnCours = true;
    const lot = file;
    const dernier = lot.at(-1).idOp;
    ecritures++;
    majStatut();
    try {
      const r = await fb.ecrireParTransaction(etat.uid, (brut) => calculer(brut, lot), appareil);
      revision = Math.max(revision, r.revision);
      file = retirerJusqua(file, dernier);
      persister();
      // What was written is the newest server state: an older snapshot still on its way
      // must not hide the operations just sent.
      if (r.revision > revisionServeur) {
        serveur = r.etat;
        revisionServeur = r.revision;
        afficher();
      }
      erreurEcriture = null;
      reessai = 0;
      if (r.ignorees.length) {
        journal("opérations ignorées", r.ignorees);
        signalerIgnorees(r.ignorees);
      }
    } catch (e) {
      journal("transaction refusée", e);
      // Network lost meanwhile: no error, the queue waits. Otherwise ⚠ and a later retry.
      erreurEcriture = e?.code === "unavailable" && !enLigne ? null : messageErreur(e);
      reessai = Math.min(reessai ? reessai * 2 : 1000, REESSAI_MAX_MS);
      clearTimeout(minuteur);
      minuteur = setTimeout(envoyer, reessai);
    } finally {
      envoiEnCours = false;
      majStatut();
      if (file.length && !minuteur) planifier();
    }
  };
  function planifier() {
    clearTimeout(minuteur);
    minuteur = setTimeout(envoyer, delai);
  }
  const envoyerMaintenant = () => {
    if (!minuteur) return;
    clearTimeout(minuteur);
    envoyer();
  };

  /** Shown state: the account's state with every pending operation of this device on top. */
  const afficher = () => {
    if (!serveur) return;
    const operations = fusionnerFiles(file, ...autres.values());
    const courant = store.lire();
    const base = { ...serveur, reglagesAppareil: courant.reglagesAppareil };
    const suivant = rejouer(base, operations).etat;
    if (
      grillesIdentiques(courant.grille, suivant.grille) &&
      JSON.stringify(courant.reglages) === JSON.stringify(suivant.reglages)
    ) {
      return; // same state (e.g. already received from another tab): no re-render
    }
    store.envoyer({ type: A.CHARGER, etat: suivant, origine: "distant" });
  };

  // Only local actions become operations. Loads — from the storage, another tab or another
  // device — never do: no ping-pong between devices.
  store.abonner((suivant, action) => {
    const avant = precedent;
    precedent = suivant;
    if (etat.mode !== "compte" || action.type === A.CHARGER) return;
    // Device-only settings (columns, debug, local picture) are never sent.
    if (suivant.grille === avant.grille && suivant.reglages === avant.reglages) return;
    const operation = {
      idOp: globalThis.crypto.randomUUID(),
      action,
      creeLe: Date.now(),
      ...decrire(avant, action),
    };
    const r = ajouter(file, operation, suivant);
    if (r.compactee) console.warn("NedoTab : file d'opérations compactée (très long hors ligne)");
    file = r.file;
    persister();
    majStatut();
    // A restoration is sent at once: another device's change must not slip in between.
    if (action.type === A.GRILLE_RESTAURER) {
      clearTimeout(minuteur);
      envoyer();
      return;
    }
    planifier();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", envoyerMaintenant);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") envoyerMaintenant();
    });
    window.addEventListener("online", () => {
      enLigne = true;
      majStatut();
      if (file.length) planifier();
    });
    window.addEventListener("offline", () => ((enLigne = false), majStatut()));
  }

  /** A change of the account's document, from this device or another one. */
  const recevoir = (brut, { ecritureEnAttente, depuisCache: cache = false }) => {
    depuisCache = cache;
    majStatut();
    if (ecritureEnAttente || !brut) return; // a write of the first sync, not yet confirmed
    const rev = Number.isInteger(brut.revision) ? brut.revision : 0;
    if (rev < revisionServeur) return; // older than what this tab just wrote
    revision = Math.max(revision, rev);
    const { etat: distant, lectureSeule } = migrer(brut);
    if (lectureSeule) {
      erreurEcriture = "Données du compte d'une version plus récente : mettez à jour NedoTab.";
      majStatut();
      return;
    }
    journal("état du compte reçu", brut.majPar, brut.revision);
    serveur = distant;
    revisionServeur = rev;
    afficher();
    // Back from the server after a time offline: send what waited.
    if (!cache && file.length && !minuteur && !envoiEnCours) planifier();
  };

  const ecouter = () => {
    arreterEcoute?.();
    arreterEcoute = fb.ecouterDocument(etat.uid, recevoir, (e) => {
      journal("écoute interrompue", e);
      erreurEcriture = messageErreur(e);
      majStatut();
    });
  };

  /**
   * Queues left by closed tabs (or by Chrome closed offline) become this tab's; the
   * queues of open tabs are only shown. Run under a lock: two new tabs never take the same.
   */
  const adopter = (orphelines) => {
    if (!orphelines.some((f) => f.length)) return;
    file = fusionnerFiles(file, ...orphelines);
    journal("opérations reprises", file.length);
    persister();
    majStatut();
    if (serveur) afficher();
    if (!minuteur && !envoiEnCours) planifier();
  };
  const surveilles = new Set();
  /** When another open tab closes (its lock is released), its leftover queue is taken. */
  const surveiller = (id) => {
    if (!verrous || surveilles.has(id)) return;
    surveilles.add(id);
    verrous
      .request(`nedotab-onglet:${id}`, async () => {
        const valeur = (await persistance.toutes())[id];
        autres.delete(id);
        if (etat.mode !== "compte" || valeur?.uid !== etat.uid) return;
        await persistance.supprimer(id);
        adopter([validerFile(valeur.file)]);
      })
      .catch((e) => journal("surveillance d'onglet", e));
  };
  const reprendreFiles = async () => {
    const reprendre = async () => {
      const vivants = verrous
        ? new Set(((await verrous.query()).held ?? []).map((v) => v.name))
        : new Set();
      const orphelines = [];
      for (const [id, valeur] of Object.entries(await persistance.toutes())) {
        if (id === idOnglet || valeur?.uid !== etat.uid) continue;
        if (vivants.has(`nedotab-onglet:${id}`)) {
          autres.set(id, validerFile(valeur.file));
          surveiller(id);
        } else {
          orphelines.push(validerFile(valeur.file));
          await persistance.supprimer(id);
        }
      }
      adopter(orphelines);
    };
    try {
      await (verrous ? verrous.request("nedotab-reprise-files", reprendre) : reprendre());
    } catch (e) {
      journal("reprise des files", e);
    }
    arreterAutres?.();
    arreterAutres = persistance.surChangement((id, valeur) => {
      if (id === idOnglet) return;
      if (valeur?.uid === etat.uid) {
        autres.set(id, validerFile(valeur.file));
        surveiller(id);
      } else autres.delete(id);
    });
  };

  const passerEnCompte = async (uid) => {
    await plat.preferences.ecrire("synchro", { uid });
    changer({ mode: "compte", uid, erreur: null, statut: "synchronise" });
    await reprendreFiles();
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
      // Operations not sent before the browser was closed are sent once the server answers.
      await reprendreFiles();
      majStatut();
      ecouter();
    },

    /** After an error: listen again and send what is pending. */
    reessayer() {
      if (etat.mode !== "compte") return this.lancerPremiereSynchro();
      erreurEcriture = null;
      reessai = 0;
      majStatut();
      ecouter();
      if (file.length) planifier();
    },

    /** Number of writes since the page opened (cost measurements). */
    statistiques: () => ({
      ecritures,
      enAttente: file.length,
      envoiEnCours,
      minuteur: minuteur !== null,
      revision,
    }),

    /** Local changes not yet confirmed by the server (sign-out and restoration warnings). */
    modificationsNonEnvoyees: () => file.length,

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
        // The initial write goes above the account's revision (the rules require it).
        if (Number.isInteger(lu?.brut.revision)) revision = Math.max(revision, lu.brut.revision);
        const localVide = local.grille.length === 0;
        let issue;
        if (!distant) {
          // No document yet: this device's state becomes the account's.
          await fb.ecrireDocument(uid, local, appareil, ++revision);
          issue = localVide ? "cree" : "envoye";
        } else if (localVide) {
          // Nothing here: the account's sites AND settings (backgrounds library) are kept.
          appliquer(distant.etat);
          issue = "recupere";
        } else if (distant.etat.grille.length === 0) {
          // The account has no site but may have settings: send this device's sites and
          // keep the account's settings (its backgrounds library is never lost).
          appliquer({ grille: local.grille, reglages: distant.etat.reglages });
          await fb.ecrireDocument(uid, store.lire(), appareil, ++revision);
          issue = "envoye";
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
            // This device's sites and settings, but the account's backgrounds library stays.
            const reglages = validerReglages({
              ...local.reglages,
              fonds: distant.etat.reglages.fonds,
            });
            appliquer({ grille: local.grille, reglages });
            await fb.ecrireDocument(uid, store.lire(), appareil, ++revision);
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
     * does not want to keep a copy on this computer (shared computer). What is still queued
     * is sent first when possible (at most 5 s).
     */
    async quitter({ garderCopie }) {
      clearTimeout(minuteur);
      minuteur = null;
      if (etat.mode === "compte" && file.length && enLigne) {
        await Promise.race([envoyer(), new Promise((r) => setTimeout(r, 5000))]);
      }
      clearTimeout(minuteur);
      minuteur = null;
      arreterEcoute?.();
      arreterEcoute = null;
      arreterAutres?.();
      arreterAutres = null;
      autres.clear();
      file = [];
      serveur = null;
      await persistance.supprimer(idOnglet).catch(() => {});
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
