import { A } from "../core/actions.js";
import { migrer } from "../core/migration.js";

/** Actions that come from elsewhere (storage, other tab) and must not be saved again. */
const EXTERNES = new Set([A.CHARGER]);

/**
 * Wires the store to the storage: debounced save (300 ms), flush when the page is hidden,
 * and live reload when another tab writes.
 *
 * Local actions not yet written are kept in `enAttente`. When another tab's state arrives
 * (live, or found in storage right before writing), those actions are replayed on top of
 * it instead of being lost or overwriting the other tab's changes.
 */
export function brancherPersistance(
  store,
  stockage,
  { reduire, delai = 300, onErreur, lectureSeule = () => false, versionConnue = null } = {},
) {
  let minuteur = null;
  let enAttente = [];
  let derniere = versionConnue; // majLe of the last state loaded or written

  const rebaser = (brut, meta) => {
    let etat = migrer(brut).etat;
    if (reduire) for (const action of enAttente) etat = reduire(etat, action);
    derniere = meta?.majLe ?? derniere;
    store.envoyer({ type: A.CHARGER, etat });
  };

  const ecrire = async () => {
    minuteur = null;
    if (lectureSeule() || enAttente.length === 0) return;
    try {
      if (stockage.lire) {
        const { etat, meta } = await stockage.lire();
        if (etat && meta && meta.majLe !== derniere && meta.ecritPar !== stockage.idInstance) {
          rebaser(etat, meta);
        }
      }
      const ecrites = enAttente.length;
      const meta = await stockage.sauvegarder(store.lire());
      enAttente = enAttente.slice(ecrites);
      derniere = meta?.majLe ?? derniere;
      if (enAttente.length) planifier();
    } catch (e) {
      onErreur?.(e);
    }
  };
  const planifier = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(ecrire, delai);
  };
  const vider = () => {
    if (minuteur) {
      clearTimeout(minuteur);
      ecrire();
    }
  };
  store.abonner((_etat, action) => {
    if (EXTERNES.has(action.type) || action.externe) return;
    enAttente.push(action);
    planifier();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") vider();
  });
  window.addEventListener("pagehide", vider);
  const arreter = stockage.surChangementExterne((brut, meta) => {
    rebaser(brut, meta);
    if (enAttente.length) planifier();
  });
  return { vider, arreter };
}
