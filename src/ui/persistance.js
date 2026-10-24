import { A } from "../core/actions.js";
import { migrer } from "../core/migration.js";

/** Actions that come from elsewhere (storage, other tab) and must not be saved again. */
const EXTERNES = new Set([A.CHARGER]);

/**
 * Wires the store to the storage: debounced save (300 ms), flush when the page is hidden,
 * and live reload when another tab writes.
 */
export function brancherPersistance(
  store,
  stockage,
  { delai = 300, onErreur, lectureSeule = () => false } = {},
) {
  let minuteur = null;
  const ecrire = async () => {
    minuteur = null;
    if (lectureSeule()) return;
    try {
      await stockage.sauvegarder(store.lire());
    } catch (e) {
      onErreur?.(e);
    }
  };
  const vider = () => {
    if (minuteur) {
      clearTimeout(minuteur);
      ecrire();
    }
  };
  store.abonner((_etat, action) => {
    if (EXTERNES.has(action.type) || action.externe) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(ecrire, delai);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") vider();
  });
  window.addEventListener("pagehide", vider);
  const arreter = stockage.surChangementExterne((brut) => {
    store.envoyer({ type: A.CHARGER, etat: migrer(brut).etat });
  });
  return { vider, arreter };
}
