import { A } from "../../core/actions.js";
import { trouver } from "../../core/arbre.js";
import { avecRattrapage, iaDe } from "../../core/ia.js";
import {
  ERREURS_BLOQUANTES,
  estimation,
  sitesARattraper,
  verrouAutreAppareil,
} from "../../core/rattrapage.js";

const CLE_PREFERENCE = "rattrapageIa";
const RAFRAICHIR_VERROU_MS = 60 * 1000;

/**
 * Catch-up of the existing sites (V4.6): tags and descriptions for sites added before the
 * AI was on. Only on request, 2 calls at a time and 300 ms between two starts, with pause,
 * resume, stop, resume after the app was closed (state kept on the device), a light lock
 * between devices (reglages.ia.rattrapage) and a stop on blocking errors.
 *
 * state: { etat: "inactif"|"en_cours"|"pause"|"termine", restants: string[], total, ok,
 *          echecs: [{ id, titre, code }], debut, raison?: string }
 *
 * @param {{
 *   store: { envoyer: Function, lire: Function },
 *   enrichissement: { executer: (site: object) => Promise<{ ok: boolean, code?: string }> },
 *   quotaRestant: () => Promise<number|null>,
 *   preferences: { lire: Function, ecrire: Function },
 *   idAppareil: () => Promise<string>,
 *   horloge?: () => number, attendre?: (ms: number) => Promise<void>,
 *   simultanes?: number, ecart?: number,
 * }} deps
 */
export function creerRattrapage({
  store,
  enrichissement,
  quotaRestant,
  preferences,
  idAppareil,
  horloge = () => Date.now(),
  attendre = (ms) => new Promise((r) => setTimeout(r, ms)),
  simultanes = 2,
  ecart = 300,
}) {
  let etat = { etat: "inactif", restants: [], total: 0, ok: 0, echecs: [], debut: 0 };
  let enVol = 0;
  let dernierVerrou = 0;
  let moi = null;
  let generation = 0; // a paused then resumed run must not be ended by the old loop
  const ecouteurs = new Set();

  const notifier = () => ecouteurs.forEach((f) => f(etat));
  const changer = (suite) => {
    etat = { ...etat, ...suite };
    // Kept on the device so that a closed app can offer to resume.
    const garde = etat.etat === "en_cours" || etat.etat === "pause";
    Promise.resolve(preferences.ecrire(CLE_PREFERENCE, garde ? etat : null)).catch(() => {});
    notifier();
  };

  async function monId() {
    moi ??= await idAppareil();
    return moi;
  }

  const ecrireVerrou = async (actif) => {
    const ia = iaDe(store.lire().reglages);
    store.envoyer({
      type: A.REGLAGES_MODIFIER,
      changements: { ia: avecRattrapage(ia, actif ? { appareil: await monId(), maj: horloge() } : null) },
    });
    dernierVerrou = horloge();
  };

  /** Sites to do and what it means for today's quota. */
  async function estimer(options) {
    const ids = sitesARattraper(store.lire().grille, options);
    let restant = null;
    try {
      restant = await quotaRestant();
    } catch {
      /* unknown quota: the server stops us anyway */
    }
    return { ids, ...estimation(ids.length, restant) };
  }

  /** Another device that is processing right now, or null. */
  async function autreAppareil() {
    return verrouAutreAppareil(iaDe(store.lire().reglages).rattrapage, await monId(), horloge());
  }

  async function traiter(id) {
    const r = trouver(store.lire().grille, id);
    const site = r?.element;
    // Gone, or written by hand meanwhile: nothing to do.
    if (!site || site.type !== "site" || site.tagsManuels) return { ignore: true };
    return enrichissement.executer(site);
  }

  async function boucle() {
    const g = ++generation;
    let dernierLancement = 0;
    while (g === generation && etat.etat === "en_cours" && etat.restants.length > 0) {
      if (enVol >= simultanes) {
        await attendre(50);
        continue;
      }
      const delai = ecart - (horloge() - dernierLancement);
      if (delai > 0) await attendre(delai);
      if (g !== generation || etat.etat !== "en_cours") break;
      const [id, ...reste] = etat.restants;
      dernierLancement = horloge();
      changer({ restants: reste });
      enVol++;
      traiter(id)
        .then((res) => {
          if (res.ignore) return;
          if (res.ok) changer({ ok: etat.ok + 1 });
          else if (ERREURS_BLOQUANTES.includes(res.code)) {
            // The site goes back in the queue: it was not really tried.
            changer({ restants: [id, ...etat.restants], etat: "pause", raison: res.code });
            store.envoyer({ type: A.SITE_DEFINIR_IA, id, etat: "aucun" });
            ecrireVerrou(false);
          } else {
            const titre = trouver(store.lire().grille, id)?.element?.titre ?? "";
            changer({ echecs: [...etat.echecs, { id, titre, code: res.code }] });
          }
        })
        .finally(() => {
          enVol--;
        });
      if (horloge() - dernierVerrou > RAFRAICHIR_VERROU_MS) await ecrireVerrou(true);
    }
    while (enVol > 0) await attendre(50);
    if (g === generation && etat.etat === "en_cours") {
      changer({ etat: "termine" });
      await ecrireVerrou(false);
    }
  }

  return {
    estimer,
    autreAppareil,
    lire: () => etat,
    abonner(f) {
      ecouteurs.add(f);
      return () => ecouteurs.delete(f);
    },

    /** Starts on these ids (the user confirmed the estimate). */
    async demarrer(ids) {
      if (etat.etat === "en_cours" || !ids.length) return false;
      changer({ etat: "en_cours", restants: [...ids], total: ids.length, ok: 0, echecs: [], debut: horloge(), raison: undefined });
      await ecrireVerrou(true);
      boucle();
      return true;
    },

    pause() {
      if (etat.etat !== "en_cours") return;
      changer({ etat: "pause", raison: "manuelle" });
      ecrireVerrou(false);
    },

    async reprendre() {
      if (etat.etat !== "pause") return false;
      // Sites left "en_attente" by a crash or a stop have nobody working on them.
      for (const id of etat.restants) {
        if (trouver(store.lire().grille, id)?.element?.ia?.etat === "en_attente")
          store.envoyer({ type: A.SITE_DEFINIR_IA, id, etat: "aucun" });
      }
      changer({ etat: "en_cours", raison: undefined });
      await ecrireVerrou(true);
      boucle();
      return true;
    },

    async arreter() {
      if (etat.etat !== "en_cours" && etat.etat !== "pause") return;
      const fini = etat.total - etat.restants.length;
      changer({ etat: "termine", restants: [], total: fini, raison: "arrete" });
      await ecrireVerrou(false);
    },

    /** Failed sites become the new list. */
    async reessayerEchecs() {
      const ids = etat.echecs.map((e) => e.id);
      if (!ids.length) return false;
      etat = { ...etat, etat: "inactif" };
      return this.demarrer(ids);
    },

    /** At startup: a processing that was left (app closed) → "pause", ready to resume. */
    async retrouver() {
      const garde = await Promise.resolve(preferences.lire(CLE_PREFERENCE)).catch(() => null);
      if (!garde?.restants?.length || !["en_cours", "pause"].includes(garde.etat)) return null;
      etat = { ...garde, etat: "pause", raison: "interrompu" };
      notifier();
      return etat;
    },

    /** Closes the report. */
    oublier() {
      if (etat.etat === "termine") changer({ etat: "inactif" });
    },
  };
}
