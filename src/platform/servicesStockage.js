/**
 * Everything stored on this device outside the picture files, shared by the extension and
 * the web app (V3.0): the state, small preferences, the pending sync operations, the safety
 * copies and the id of the installation. `zone()` / `evenements()` give objects shaped like
 * chrome.storage.local / chrome.storage.onChanged (the extension's own, or zoneWeb.js for
 * the web app). They are read on first use only: both platforms are loaded, only one runs.
 */
import { creerStockage } from "./stockageChrome.js";

const PREFIXE_OPERATIONS = "operationsEnAttente:";
const PREFIXE_COPIE = "copieAvantSynchro:";

export function creerServicesStockage(zoneDe, evenementsDe) {
  const zone = {
    get: (...a) => zoneDe().get(...a),
    set: (...a) => zoneDe().set(...a),
    remove: (...a) => zoneDe().remove(...a),
  };
  const evenements = {
    addListener: (f) => evenementsDe().addListener(f),
    removeListener: (f) => evenementsDe().removeListener(f),
  };
  let stockageCourant;
  const stockage = () => {
    stockageCourant ??= creerStockage(zone, evenements);
    return stockageCourant;
  };

  /** Small per-device preferences, outside the synced state. */
  const preferences = {
    async lire(cle) {
      const r = await zone.get(`pref:${cle}`);
      return r[`pref:${cle}`];
    },
    async ecrire(cle, valeur) {
      await zone.set({ [`pref:${cle}`]: valeur });
    },
  };

  /**
   * Pending sync operations (V2.9), one queue per open tab: two tabs never overwrite each
   * other's queue. They survive closing the browser.
   */
  const operations = {
    async ecrire(idOnglet, valeur) {
      await zone.set({ [PREFIXE_OPERATIONS + idOnglet]: valeur });
    },
    async supprimer(idOnglet) {
      await zone.remove(PREFIXE_OPERATIONS + idOnglet);
    },
    async toutes() {
      const tout = await zone.get(null);
      return Object.fromEntries(
        Object.entries(tout)
          .filter(([cle]) => cle.startsWith(PREFIXE_OPERATIONS))
          .map(([cle, v]) => [cle.slice(PREFIXE_OPERATIONS.length), v]),
      );
    },
    /** callback(idOnglet, valeur | null) when another tab changes its queue. */
    surChangement(callback) {
      const ecouteur = (changements, nomZone) => {
        if (nomZone !== "local") return;
        for (const [cle, { newValue }] of Object.entries(changements)) {
          if (cle.startsWith(PREFIXE_OPERATIONS))
            callback(cle.slice(PREFIXE_OPERATIONS.length), newValue ?? null);
        }
      };
      evenements.addListener(ecouteur);
      return () => evenements.removeListener(ecouteur);
    },
  };

  /**
   * Safety copies of the local state, written before any synchronisation step
   * (the 3 most recent are kept). Returned newest first: [{ cle, date, etat }].
   */
  const copies = {
    /** Every safety copy of this device (account deletion, V2.10). */
    async effacerTout() {
      await zone.remove((await copies.lister()).map((c) => c.cle));
    },
    async enregistrer(etat) {
      const cle = `${PREFIXE_COPIE}${new Date().toISOString()}`;
      await zone.set({ [cle]: etat });
      const toutes = (await copies.lister()).map((c) => c.cle);
      const anciennes = toutes.slice(3);
      if (anciennes.length) await zone.remove(anciennes);
      return cle;
    },
    async lister() {
      const tout = await zone.get(null);
      return Object.keys(tout)
        .filter((k) => k.startsWith(PREFIXE_COPIE))
        .sort()
        .reverse()
        .map((cle) => ({
          cle,
          date: Date.parse(cle.slice(PREFIXE_COPIE.length)),
          etat: tout[cle],
        }));
    },
  };

  /** Persistent id of this installation (not of the tab): who wrote the account's data. */
  async function idAppareil() {
    let id = await preferences.lire("idAppareil");
    if (!id) {
      id = globalThis.crypto.randomUUID();
      await preferences.ecrire("idAppareil", id);
    }
    return id;
  }

  return { stockage, preferences, operations, copies, idAppareil };
}
