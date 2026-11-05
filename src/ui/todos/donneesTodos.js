import { creerSujet, estPleinSujets, renommerSujet, trierSujets } from "../../core/sujets.js";
import { ordreEntre, renumeroter } from "../../core/todos.js";

/** Time left to cancel a removal before it is really written. */
export const DELAI_ANNULATION_MS = 5000;

/**
 * Data of the todo panel (V6.1): subjects and counters from Firestore, and the actions on them.
 * The interface never calls Firestore itself: it goes through here, and here through the module
 * `firebase/todos.js` (loaded on demand). ONE listener per kind at a time, stopped by `arreter()`
 * when the panel closes and the tab is hidden.
 *
 * Removals are delayed by 5 s ("Annuler"): the element only disappears from the screen, and the
 * real write is done at the end of the delay (or at once when the page is hidden).
 *
 * @param {object} d
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 */
export function creerDonneesTodos({ charger, uid }) {
  const abonnes = new Set();
  let arrets = [];
  let demarre = false;
  const etat = {
    statut: "chargement", // chargement | ok | erreur
    sujets: [],
    compteurs: { nbSujets: 0, nbTodos: 0, octets: 0 },
    depuisCache: false,
    enAttente: false,
  };
  /** Removals waiting for the end of their delay: id → { minuteur, ecrire }. */
  const suppressions = new Map();

  const notifier = () => abonnes.forEach((f) => f());
  const fb = () => charger();

  function visibles() {
    return trierSujets(etat.sujets.filter((s) => !suppressions.has(`sujet:${s.id}`)));
  }

  async function demarrer() {
    const id = uid();
    if (!id || demarre) return;
    demarre = true;
    etat.statut = "chargement";
    notifier();
    try {
      const m = await fb();
      if (!demarre) return;
      arrets.push(
        m.ecouterSujets(
          id,
          (sujets, meta) => {
            etat.sujets = sujets;
            etat.statut = "ok";
            etat.depuisCache = meta.depuisCache;
            etat.enAttente = meta.enAttente;
            notifier();
          },
          () => {
            etat.statut = "erreur";
            notifier();
          },
        ),
        m.ecouterCompteursTodos(
          id,
          (c) => {
            etat.compteurs = c;
            notifier();
          },
          () => {},
        ),
      );
    } catch {
      demarre = false;
      etat.statut = "erreur";
      notifier();
    }
  }

  function arreter() {
    demarre = false;
    arrets.forEach((a) => a());
    arrets = [];
  }

  /** Runs `ecrire` after the delay, unless cancelled. @returns {{ annuler: () => void }} */
  function differer(cle, ecrire) {
    let fini = false;
    const lancer = () => {
      if (fini) return;
      fini = true;
      clearTimeout(entree.minuteur);
      suppressions.delete(cle);
      Promise.resolve(ecrire())
        .catch(() => {})
        .finally(notifier);
    };
    const entree = { minuteur: setTimeout(lancer, DELAI_ANNULATION_MS), ecrire: lancer };
    suppressions.set(cle, entree);
    notifier();
    return {
      annuler() {
        if (fini) return;
        fini = true;
        clearTimeout(entree.minuteur);
        suppressions.delete(cle);
        notifier();
      },
    };
  }

  /** Writes every waiting removal now (page hidden or closed). */
  function viderSuppressions() {
    [...suppressions.values()].forEach((e) => e.ecrire());
  }

  // --- Actions on the subjects ---------------------------------------------------------------

  async function ajouterSujet(nom, couleur = null) {
    if (estPleinSujets(etat.compteurs.nbSujets))
      return { ok: false, erreur: "30 sujets maximum." };
    const liste = visibles();
    const r = creerSujet({
      nom,
      couleur,
      ordre: ordreEntre(liste.at(-1)?.ordre ?? null, null),
    });
    if (!r.ok) return r;
    try {
      const id = await (await fb()).creerSujetTodos(uid(), r.sujet);
      return { ok: true, id };
    } catch (e) {
      return { ok: false, erreur: messageErreur(e) };
    }
  }

  async function renommer(id, nom) {
    const actuel = etat.sujets.find((s) => s.id === id);
    if (!actuel) return { ok: false, erreur: "Ce sujet n'existe plus." };
    const r = renommerSujet(actuel, nom);
    if (!r.ok) return r;
    if (r.sujet.nom === actuel.nom) return { ok: true };
    return ecrireSujet(id, { nom: r.sujet.nom });
  }

  const colorer = (id, couleur) => ecrireSujet(id, { couleur });

  async function ecrireSujet(id, champs) {
    try {
      await (await fb()).majSujet(uid(), id, champs);
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: messageErreur(e) };
    }
  }

  /**
   * Moves a subject so that it ends up after `apresId` (null: first). Only the moved subject is
   * written; when the gap between its neighbours is exhausted the whole list is renumbered once.
   */
  async function deplacerSujet(id, apresId) {
    const autres = visibles().filter((s) => s.id !== id);
    const i = apresId === null ? 0 : autres.findIndex((s) => s.id === apresId) + 1;
    const avant = autres[i - 1] ?? null;
    const apres = autres[i] ?? null;
    const ordre = ordreEntre(avant?.ordre ?? null, apres?.ordre ?? null);
    try {
      const m = await fb();
      if (ordre !== null) {
        await m.majSujet(uid(), id, { ordre });
      } else {
        const bouge = visibles().find((s) => s.id === id);
        const liste = [...autres.slice(0, i), bouge, ...autres.slice(i)];
        await m.ecrireOrdresTodos(uid(), "sujets", renumeroter(liste));
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: messageErreur(e) };
    }
  }

  /**
   * Hides the subject at once and removes it (with its todos) after the delay.
   * @returns {{ annuler: () => void }}
   */
  function supprimerSujet(id) {
    return differer(`sujet:${id}`, async () => (await fb()).supprimerSujet(uid(), id));
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => document.hidden && viderSuppressions());
    addEventListener("pagehide", viderSuppressions);
  }

  return {
    /** Snapshot for the views. Subjects waiting to be removed are left out. */
    etat: () => ({ ...etat, sujets: visibles() }),
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    demarrer,
    arreter,
    estDemarre: () => demarre,
    ajouterSujet,
    renommer,
    colorer,
    deplacerSujet,
    supprimerSujet,
    // Used by the todo views (V6.2) and the settings (V6.7).
    differer,
    viderSuppressions,
    fb,
    uid,
    notifier,
    reinitialiser() {
      arreter();
      etat.sujets = [];
      etat.compteurs = { nbSujets: 0, nbTodos: 0, octets: 0 };
      etat.statut = "chargement";
      notifier();
    },
  };
}

/** A user-readable message for a Firestore error (no technical code shown). */
export function messageErreur(e) {
  if (e?.code === "permission-denied") return "Refusé : limite atteinte ou compte non autorisé.";
  if (e?.code === "not-found") return "Cet élément a été supprimé sur un autre appareil.";
  if (e?.code === "unavailable") return "Hors ligne : l'action est en attente d'envoi.";
  return "L'opération a échoué. Réessayez.";
}
