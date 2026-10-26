/**
 * Daily quota of AI calls per user (V4.0), in users/{uid}/prive/quota:
 * { jour: "AAAA-MM-JJ", appels: n }. The day changes at midnight, Paris time. The count is
 * taken BEFORE the call to the provider, in a transaction (two calls at the same time
 * cannot both take the last unit).
 */
export const QUOTA_PAR_DEFAUT = 300;

/** "AAAA-MM-JJ" of `date` in Europe/Paris. */
export function jourParis(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

export class QuotaDepasse extends Error {
  constructor(limite) {
    super(`Limite quotidienne atteinte (${limite} appels). Elle se réinitialise à minuit.`);
    this.limite = limite;
  }
}

/**
 * Pure rule: the quota document after `n` more calls today, or QuotaDepasse.
 * @param {{ jour?: string, appels?: number } | undefined} actuel
 */
export function apresConsommation(actuel, { jour, n = 1, limite = QUOTA_PAR_DEFAUT }) {
  const appels = actuel?.jour === jour ? (actuel.appels ?? 0) : 0;
  if (appels + n > limite) throw new QuotaDepasse(limite);
  return { jour, appels: appels + n };
}

/**
 * Takes `n` calls from the quota of `uid` (Firestore transaction).
 * @param {import("firebase-admin/firestore").Firestore} db
 */
export async function consommer(db, uid, { n = 1, limite, maintenant = new Date() } = {}) {
  const ref = db.doc(`users/${uid}/prive/quota`);
  const jour = jourParis(maintenant);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const suivant = apresConsommation(snap.exists ? snap.data() : undefined, { jour, n, limite });
    t.set(ref, suivant);
    return suivant;
  });
}
