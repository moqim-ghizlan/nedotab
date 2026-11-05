/**
 * Delayed writes (V6.2). Pure: only timers. `appeler(valeur)` keeps the LAST value and runs
 * `action(valeur)` once, `delai` ms after the last call: ten keystrokes in a second are one write.
 * `vider()` runs it at once when something is waiting (closing the window, changing subject,
 * page hidden); `annuler()` drops it.
 *
 * @template T
 * @param {(valeur: T) => unknown} action
 * @param {number} [delai] 1 500 ms: the project's rule for typing
 * @param {{ setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout }} [horloge]
 */
export function creerDiffere(action, delai = 1500, horloge = {}) {
  const planifier = horloge.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const annulerTimer = horloge.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  let minuteur = null;
  let valeur;
  let attente = false;

  const lancer = () => {
    minuteur = null;
    if (!attente) return undefined;
    attente = false;
    const v = valeur;
    valeur = undefined;
    return action(v);
  };

  return {
    appeler(v) {
      valeur = v;
      attente = true;
      if (minuteur !== null) annulerTimer(minuteur);
      minuteur = planifier(lancer, delai);
    },
    /** Runs the waiting write now. @returns whatever `action` returned, or undefined. */
    vider() {
      if (minuteur !== null) annulerTimer(minuteur);
      return lancer();
    },
    annuler() {
      if (minuteur !== null) annulerTimer(minuteur);
      minuteur = null;
      attente = false;
      valeur = undefined;
    },
    enAttente: () => attente,
  };
}
