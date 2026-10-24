import { A } from "../../core/actions.js";
import { comparer } from "../../core/differences.js";
import { migrer } from "../../core/migration.js";
import { dateHeure } from "../../core/sauvegardes.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";

/**
 * Restoration of a backup or of a local copy (V2.8). Never without a confirmed safety copy
 * of the current state: online ("avant-restauration") in account mode, else a local copy.
 */
export function creerRestauration({
  store,
  session,
  charger = chargerFirebase,
  plat = plateforme,
}) {
  const enCompte = () => session.synchro.lire().mode === "compte";
  const horsLigne = () =>
    session.synchro.lire().statut === "hors-ligne" ||
    (typeof navigator !== "undefined" && navigator.onLine === false);

  /**
   * What would be restored: migrated state, differences with now, pictures that no longer
   * exist (library entries that left the library since: their files were deleted).
   */
  function preparer(source) {
    const { etat, lectureSeule } = migrer({
      versionSchema: source.versionSchema,
      grille: source.grille,
      reglages: source.reglages,
    });
    const actuels = new Set((store.lire().reglages.fonds ?? []).map((f) => f.id));
    const fonds = (etat.reglages.fonds ?? []).filter((f) => actuels.has(f.id));
    let reglages = { ...etat.reglages, fonds };
    let fondPerdu = false;
    if (reglages.fond?.type === "image" && reglages.fond.id && !actuels.has(reglages.fond.id)) {
      reglages = { ...reglages, fond: { type: "aucun" } };
      fondPerdu = true;
    }
    return {
      etat: { ...etat, reglages },
      lectureSeule,
      fondPerdu,
      differences: comparer(store.lire().grille, etat.grille),
    };
  }

  /**
   * @returns {Promise<{ ok: true, annuler: () => void, fondPerdu: boolean } | { ok: false, erreur: string }>}
   */
  async function restaurer(source) {
    const prepare = preparer(source);
    if (prepare.lectureSeule) {
      return { ok: false, erreur: "Cette sauvegarde vient d'une version plus récente de NedoTab." };
    }
    if (enCompte() && horsLigne()) {
      return {
        ok: false,
        erreur:
          "Restauration impossible hors ligne : la copie de sécurité doit être enregistrée en ligne.",
      };
    }
    const avant = store.lire();
    try {
      if (enCompte()) {
        const fb = await charger();
        const uid = session.compte.lire().profil.uid;
        await fb.creerSauvegarde(uid, avant, {
          type: "avant-restauration",
          nom: `Avant la restauration du ${dateHeure(Date.now())}`,
        });
        await fb.rotation(uid, "avant-restauration", 10);
      } else {
        await plat.copies.enregistrer(avant);
      }
    } catch {
      return {
        ok: false,
        erreur: "Impossible de créer une copie de sécurité, restauration annulée.",
      };
    }
    store.envoyer({
      type: A.GRILLE_RESTAURER,
      etat: prepare.etat,
      sauvegardeId: source.id ?? null,
    });
    return {
      ok: true,
      fondPerdu: prepare.fondPerdu,
      // Back to the state saved just before (no new safety copy for an undo).
      annuler: () =>
        store.envoyer({
          type: A.GRILLE_RESTAURER,
          etat: { grille: avant.grille, reglages: avant.reglages },
          sauvegardeId: null,
        }),
    };
  }

  /** Local changes not yet sent: a restoration drops them (V2.9). */
  const nonEnvoyees = () => (enCompte() ? (session.synchro.modificationsNonEnvoyees?.() ?? 0) : 0);

  return { preparer, restaurer, horsLigne, enCompte, nonEnvoyees };
}
