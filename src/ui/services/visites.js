/**
 * V4.21 — recording of the visits (sites opened from NedoTab).
 *
 * A click on a tile leaves the page: the visit is first added to a durable local queue (a few
 * milliseconds, at most 150 ms before navigating), then sent to the database in ONE write:
 * at the start of each page, every 2 minutes, and when the page is hidden. The queue is only
 * emptied once the write is confirmed; the database is the reference, the queue a waiting room.
 * Without an account the visits pile up locally and join the database at the first sync.
 */
import {
  ANTI_DOUBLON_MS,
  estDoublon,
  fusionnerVisites,
  normaliserStats,
  statsDeVisites,
} from "../../core/usage.js";

export const CLE_FILE = "visitesEnAttente";
export const CLE_LOCALES = "visitesLocales";
export const DELAI_NAVIGATION_MS = 150;
export const INTERVALLE_ENVOI_MS = 120_000;
/** Tolerance between the clock of the device and the server when comparing change times. */
const TOLERANCE_HORLOGE_MS = 5 * 60_000;

/**
 * @param {object} d
 * @param {{ lire: (cle) => Promise<any>, ecrire: (cle, v) => Promise<void> }} d.prefs
 * @param {() => boolean} d.actif tracking on (setting)
 * @param {() => string|null} d.uid signed-in user, or null (local mode)
 * @param {() => Promise<{ envoyer, majServeur }|null>} d.base database access (loaded on demand)
 * @param {() => number} [d.maintenant]
 */
export function creerServiceVisites({ prefs, actif, uid, base, maintenant = Date.now }) {
  let file = []; // { id, quand, lot?, envoyeLe? }
  let charge = null;
  let envoiEnCours = null;
  const dernieres = new Map();

  const charger = () =>
    (charge ??= prefs
      .lire(CLE_FILE)
      .then((v) => {
        const stockee = Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : [];
        file = [...stockee, ...file];
      })
      .catch(() => {}));

  const persister = () => prefs.ecrire(CLE_FILE, file).catch(() => {});

  /** Records one visit. Resolves when it is durable locally (never rejects). */
  async function enregistrer(id) {
    if (!actif() || typeof id !== "string" || !id) return;
    const t = maintenant();
    if (estDoublon(dernieres, id, t)) return;
    dernieres.set(id, t);
    await charger();
    file.push({ id, quand: t });
    await persister();
  }

  /** Visits recorded before navigating: never waits more than 150 ms. */
  const enregistrerAvantNavigation = (id) =>
    Promise.race([
      enregistrer(id),
      new Promise((ok) => setTimeout(ok, DELAI_NAVIGATION_MS)),
    ]);

  /** Local statistics of the signed-out mode, merged into the database at the first sync. */
  async function ajouterLocales(visites) {
    const actuel = await prefs.lire(CLE_LOCALES).catch(() => null);
    await prefs.ecrire(CLE_LOCALES, fusionnerVisites(actuel, statsDeVisites(visites)));
  }

  /**
   * Entries sent but not confirmed (page closed during the write): kept only if the server
   * did not receive them (change time older than the sending), so nothing is counted twice.
   */
  async function resoudreEnvoyees(b, u) {
    const envoyees = file.filter((v) => v.lot);
    if (envoyees.length === 0) return;
    const recu = await b.majServeur(u);
    const premier = Math.min(...envoyees.map((v) => v.envoyeLe));
    if (recu >= premier - TOLERANCE_HORLOGE_MS) {
      file = file.filter((v) => !v.lot);
    } else {
      for (const v of envoyees) {
        delete v.lot;
        delete v.envoyeLe;
      }
    }
  }

  /** Sends the queue in one write. Safe to call at any time; does nothing when empty. */
  function envoyer() {
    envoiEnCours ??= (async () => {
      await charger();
      const u = uid();
      if (!actif() || file.length === 0) return false;
      if (!u) {
        const visites = file.splice(0);
        await ajouterLocales(visites);
        await persister();
        return true;
      }
      const b = await base();
      if (!b) return false;
      await resoudreEnvoyees(b, u);
      const lot = file.filter((v) => !v.lot);
      if (lot.length === 0) {
        await persister();
        return false;
      }
      const id = `${maintenant()}-${Math.random().toString(36).slice(2, 8)}`;
      for (const v of lot) {
        v.lot = id;
        v.envoyeLe = maintenant();
      }
      await persister(); // marked first: a closed page will not send them twice
      try {
        await b.envoyer(u, statsDeVisites(lot));
      } catch {
        for (const v of lot) {
          delete v.lot;
          delete v.envoyeLe;
        }
        await persister();
        return false;
      }
      file = file.filter((v) => v.lot !== id);
      await persister();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        envoiEnCours = null;
      });
    return envoiEnCours;
  }

  /** Local stats of the signed-out mode, to add to the database at the first sync. */
  async function fusionnerLocalesDansBase() {
    const u = uid();
    const b = u ? await base() : null;
    if (!b) return false;
    const locales = normaliserStats(await prefs.lire(CLE_LOCALES).catch(() => null));
    if (Object.keys(locales.poids).length === 0) return false;
    await b.envoyer(u, locales);
    await prefs.ecrire(CLE_LOCALES, null).catch(() => {});
    return true;
  }

  /** Forgets everything waiting (tracking switched off or history erased). */
  async function vider() {
    file = [];
    charge = Promise.resolve();
    await persister();
    await prefs.ecrire(CLE_LOCALES, null).catch(() => {});
  }

  /** Starts the periodic and visibility sends; returns the function that stops them. */
  function demarrer({ doc = globalThis.document, planifier = setInterval, arreter = clearInterval } = {}) {
    envoyer();
    const minuteur = planifier(() => envoyer(), INTERVALLE_ENVOI_MS);
    const surVisibilite = () => doc?.visibilityState === "hidden" && envoyer();
    doc?.addEventListener?.("visibilitychange", surVisibilite);
    return () => {
      arreter(minuteur);
      doc?.removeEventListener?.("visibilitychange", surVisibilite);
    };
  }

  return {
    enregistrer,
    enregistrerAvantNavigation,
    envoyer,
    fusionnerLocalesDansBase,
    lireLocales: async () => normaliserStats(await prefs.lire(CLE_LOCALES).catch(() => null)),
    vider,
    demarrer,
    enAttente: () => file.length,
    ANTI_DOUBLON_MS,
  };
}
