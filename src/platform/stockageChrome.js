const CLE = "etat";

/**
 * Storage adapter on top of a chrome.storage-like area. Every write is tagged with the id
 * of this page instance so that a tab ignores the echo of its own writes.
 */
export function creerStockage(zone, evenements, idInstance = globalThis.crypto.randomUUID()) {
  return {
    idInstance,
    async charger() {
      const r = await zone.get(CLE);
      const brut = r?.[CLE];
      if (!brut) return null;
      // eslint-disable-next-line no-unused-vars
      const { ecritPar, majLe, ...etat } = brut;
      return etat;
    },
    async sauvegarder(etat) {
      await zone.set({ [CLE]: { ...etat, ecritPar: idInstance, majLe: Date.now() } });
    },
    surChangementExterne(callback) {
      const ecouteur = (changements, nomZone) => {
        if (nomZone !== "local" || !changements[CLE]) return;
        const nouveau = changements[CLE].newValue;
        if (!nouveau || nouveau.ecritPar === idInstance) return;
        // eslint-disable-next-line no-unused-vars
        const { ecritPar, majLe, ...etat } = nouveau;
        callback(etat);
      };
      evenements.addListener(ecouteur);
      return () => evenements.removeListener(ecouteur);
    },
  };
}
