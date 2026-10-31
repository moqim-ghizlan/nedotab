/**
 * Sending the chat stream to the browser (V4.12). The provider can send a few characters at a
 * time, tens of times a second: the deltas are grouped so that the browser receives at most one
 * chunk of text every `intervalle` ms. Other events (end, error) leave at once, after the text
 * that precedes them.
 */
export const INTERVALLE_MS = 50;

/**
 * @param {AsyncIterable<{ type: string, delta?: string }>} flux events of a provider adapter
 * @param {(morceau: object) => Promise<unknown>} envoyer sends one chunk to the browser
 * @returns {Promise<object|null>} the last event ("fin" or "erreur"), null if the stream stopped
 */
export async function diffuser(flux, envoyer, { intervalle = INTERVALLE_MS } = {}) {
  let tampon = "";
  let minuteur = null;
  let envois = Promise.resolve();
  let dernier = null;
  const poster = (morceau) => {
    // A client that left makes the write fail: the abort signal stops the provider anyway.
    envois = envois.then(() => envoyer(morceau)).catch(() => {});
  };
  const vider = () => {
    clearTimeout(minuteur);
    minuteur = null;
    if (!tampon) return;
    poster({ type: "texte", delta: tampon });
    tampon = "";
  };
  try {
    for await (const evenement of flux) {
      if (evenement.type === "texte") {
        tampon += evenement.delta;
        minuteur ??= setTimeout(vider, intervalle);
      } else {
        vider();
        dernier = evenement;
        if (evenement.type === "erreur") poster({ type: "erreur", code: evenement.code });
      }
    }
  } finally {
    vider();
    await envois;
  }
  return dernier;
}
