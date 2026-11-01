/**
 * Usage of the AI per user (V4.19): users/{uid}/usage/{AAAA-MM}, written only by the functions.
 *   { jours: { "21": bloc }, parUsage: { chat: bloc }, parFournisseur: { gemini: bloc },
 *     total: bloc, appelsEvites: n, sansPrix: n }       bloc = { appels, jetonsEntree, jetonsSortie, coutEstime }
 * Counters only, with increments (no read before writing): NEVER a message, a question, a URL
 * or any content. The estimated cost uses the prices of config/ia at the time of the call.
 */
import { coutEstime, etatLimites, moisDe, jourDuMois, prixDe, validerLimites } from "./partage/estimation.js";
import { jourParis } from "./quota.js";

/**
 * @param {{ db: any, config: () => Promise<any>, increment: (n: number) => any,
 *   horloge?: () => number }} deps `increment`: FieldValue.increment in production
 */
export function creerUsage({ db, config, increment, horloge = () => Date.now() }) {
  const ref = (uid, mois) => db.doc(`users/${uid}/usage/${mois}`);
  const maintenant = () => jourParis(new Date(horloge()));
  const bloc = (e, s, cout) => ({
    appels: increment(1),
    jetonsEntree: increment(e),
    jetonsSortie: increment(s),
    coutEstime: increment(cout),
  });

  /** One paid call (finished or interrupted). Never throws: statistics must not break a call. */
  async function enregistrer(uid, { usage, fournisseur, modele, jetonsEntree = 0, jetonsSortie = 0, incomplet = false, prixPerso }) {
    try {
      const c = await config();
      const prix = prixDe(c.prix, fournisseur, modele, prixPerso);
      const cout = coutEstime({ entree: jetonsEntree, sortie: jetonsSortie }, prix, c.tauxChange);
      const b = bloc(jetonsEntree, jetonsSortie, cout ?? 0);
      const jour = maintenant();
      await ref(uid, moisDe(jour)).set(
        {
          jours: { [jourDuMois(jour)]: b },
          parUsage: { [usage]: bloc(jetonsEntree, jetonsSortie, cout ?? 0) },
          parFournisseur: { [fournisseur]: bloc(jetonsEntree, jetonsSortie, cout ?? 0) },
          total: bloc(jetonsEntree, jetonsSortie, cout ?? 0),
          ...(cout === null ? { sansPrix: increment(1) } : {}),
          ...(incomplet ? { incomplets: increment(1) } : {}),
        },
        { merge: true },
      );
    } catch {
      /* the call already happened; a missing statistic is not worth an error */
    }
  }

  /** A call saved by the cache: counted apart, nothing billed. */
  async function evite(uid) {
    try {
      await ref(uid, moisDe(maintenant())).set({ appelsEvites: increment(1) }, { merge: true });
    } catch {
      /* same */
    }
  }

  async function lireMois(uid, mois) {
    const snap = await ref(uid, mois).get();
    return snap.exists ? snap.data() : {};
  }

  /** Today and this month, for the personal limits. */
  async function usageCourant(uid) {
    const jour = maintenant();
    const m = await lireMois(uid, moisDe(jour));
    const j = m.jours?.[jourDuMois(jour)] ?? {};
    return {
      jour: { appels: j.appels ?? 0, coutEstime: j.coutEstime ?? 0 },
      mois: { appels: m.total?.appels ?? 0, coutEstime: m.total?.coutEstime ?? 0 },
      doc: m,
    };
  }

  /** The user's personal limits (reglages.ia.limites), cleaned. */
  async function limitesDe(uid) {
    const snap = await db.doc(`users/${uid}`).get();
    return validerLimites(snap.exists ? snap.data()?.reglages?.ia?.limites : null);
  }

  /** Before a paid call: refuses ("limite-personnelle") when a personal limit is reached. */
  async function verifierLimite(uid) {
    const limites = await limitesDe(uid);
    if (!limites) return null;
    const etat = etatLimites(limites, await usageCourant(uid));
    return etat.atteinte;
  }

  /** Everything the "Consommation" screen shows. */
  async function consommation(uid) {
    const jour = maintenant();
    const [annee, mois] = jour.split("-").map(Number);
    const precedents = [];
    for (let i = 1; i <= 11; i++) {
      const d = new Date(Date.UTC(annee, mois - 1 - i, 1));
      const cle = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const doc = await lireMois(uid, cle);
      if (doc.total) precedents.push({ mois: cle, total: doc.total, appelsEvites: doc.appelsEvites ?? 0 });
    }
    const courant = await usageCourant(uid);
    const limites = await limitesDe(uid);
    const c = await config();
    return {
      jour,
      mois: moisDe(jour),
      aujourdhui: courant.jour,
      ceMois: courant.doc,
      precedents,
      limites,
      etatLimites: etatLimites(limites, courant),
      prix: { majLe: c.majPrix ?? null, tauxChange: c.tauxChange ?? {} },
    };
  }

  return { enregistrer, evite, verifierLimite, consommation, usageCourant };
}
