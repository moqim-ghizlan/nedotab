/**
 * Vault session (V4.26): locked / unlocked state, auto-lock timers, events. The key (a
 * non-extractable CryptoKey) lives ONLY here, in memory: never in localStorage, sessionStorage,
 * chrome.storage or logs. No DOM, no Firebase.
 */

export const DELAI_INACTIVITE_DEFAUT_MIN = 15;
export const DELAI_ARRIERE_PLAN_DEFAUT_MIN = 5;
export const DELAIS_PROPOSES_MIN = [5, 15, 30, 60];

/**
 * @param {{ inactiviteMin?: number, arrierePlanMin?: number, maintenant?: () => number }} [options]
 */
export function creerSessionCoffre({
  inactiviteMin = DELAI_INACTIVITE_DEFAUT_MIN,
  arrierePlanMin = DELAI_ARRIERE_PLAN_DEFAUT_MIN,
  maintenant = Date.now,
} = {}) {
  let vk = null;
  let delai = inactiviteMin;
  let minuteur = null;
  let finLe = 0;
  let cacheLe = null;
  const abonnes = { deverrouille: new Set(), verrouille: new Set() };

  const emettre = (nom) => abonnes[nom].forEach((f) => f());
  const arreter = () => {
    clearTimeout(minuteur);
    minuteur = null;
  };
  const armer = () => {
    arreter();
    finLe = maintenant() + delai * 60_000;
    minuteur = setTimeout(verrouiller, delai * 60_000);
  };

  function verrouiller() {
    arreter();
    cacheLe = null;
    if (!vk) return;
    vk = null; // the key is forgotten; the UI removes the decrypted content from the DOM
    emettre("verrouille");
  }

  return {
    estDeverrouille: () => vk !== null,
    /** The key, or null when locked. Counts as activity. */
    cle() {
      if (vk) armer();
      return vk;
    },
    deverrouiller(cle) {
      vk = cle;
      armer();
      emettre("deverrouille");
    },
    verrouiller,
    /** Any interaction in the panel postpones the auto-lock. */
    activite() {
      if (vk) armer();
    },
    /** Minutes before the auto-lock (null when locked). */
    minutesRestantes: () => (vk ? Math.max(0, Math.ceil((finLe - maintenant()) / 60_000)) : null),
    definirDelai(minutes) {
      if (!DELAIS_PROPOSES_MIN.includes(minutes)) return;
      delai = minutes;
      if (vk) armer();
    },
    /** The tab goes to the background / comes back: locks if it stayed hidden too long. */
    visibilite(cache) {
      if (!vk) return;
      if (cache) cacheLe = maintenant();
      else {
        if (cacheLe !== null && maintenant() - cacheLe >= arrierePlanMin * 60_000) verrouiller();
        cacheLe = null;
      }
    },
    surDeverrouille(f) {
      abonnes.deverrouille.add(f);
      return () => abonnes.deverrouille.delete(f);
    },
    surVerrouille(f) {
      abonnes.verrouille.add(f);
      return () => abonnes.verrouille.delete(f);
    },
  };
}

/** Wait before the next password try: none for 5 errors, then 2 s, 4 s… up to 60 s (UI only). */
export function delaiApresErreurs(erreurs) {
  return erreurs < 5 ? 0 : Math.min(60, 2 ** (erreurs - 4)) * 1000;
}
