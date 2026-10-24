const CLE = "etat";

function separer(brut) {
  if (!brut) return { etat: null, meta: null };
  const { ecritPar, majLe, ...etat } = brut;
  return { etat, meta: { ecritPar, majLe } };
}

/**
 * Storage adapter on top of a chrome.storage-like area. Every write is tagged with the id
 * of this page instance (`ecritPar`) and a timestamp (`majLe`) so that a tab ignores the
 * echo of its own writes and can tell whether someone else wrote in the meantime.
 */
export function creerStockage(zone, evenements, idInstance = globalThis.crypto.randomUUID()) {
  return {
    idInstance,
    /** @returns {Promise<{ etat: object|null, meta: { ecritPar: string, majLe: number }|null }>} */
    async lire() {
      const r = await zone.get(CLE);
      return separer(r?.[CLE]);
    },
    async charger() {
      return (await this.lire()).etat;
    },
    /** @returns {Promise<{ ecritPar: string, majLe: number }>} */
    async sauvegarder(etat) {
      const meta = { ecritPar: idInstance, majLe: Date.now() };
      await zone.set({ [CLE]: { ...etat, ...meta } });
      return meta;
    },
    surChangementExterne(callback) {
      const ecouteur = (changements, nomZone) => {
        if (nomZone !== "local" || !changements[CLE]) return;
        const nouveau = changements[CLE].newValue;
        if (!nouveau || nouveau.ecritPar === idInstance) return;
        const { etat, meta } = separer(nouveau);
        callback(etat, meta);
      };
      evenements.addListener(ecouteur);
      return () => evenements.removeListener(ecouteur);
    },
  };
}
