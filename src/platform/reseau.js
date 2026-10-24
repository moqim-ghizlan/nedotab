/** Network helpers shared by the platforms. Every failure resolves to null, never throws. */

function signalAvecDelai(delai, signalParent) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delai);
  const relayer = () => controleur.abort();
  signalParent?.addEventListener("abort", relayer, { once: true });
  return {
    signal: controleur.signal,
    liberer() {
      clearTimeout(minuteur);
      signalParent?.removeEventListener("abort", relayer);
    },
  };
}

async function lireLimite(reponse, maxOctets) {
  const lecteur = reponse.body?.getReader();
  if (!lecteur) return (await reponse.text()).slice(0, maxOctets);
  const morceaux = [];
  let total = 0;
  while (total < maxOctets) {
    const { done, value } = await lecteur.read();
    if (done) break;
    morceaux.push(value);
    total += value.length;
  }
  lecteur.cancel().catch(() => {});
  const tout = new Uint8Array(Math.min(total, maxOctets));
  let pos = 0;
  for (const m of morceaux) {
    const part = m.subarray(0, tout.length - pos);
    tout.set(part, pos);
    pos += part.length;
    if (pos >= tout.length) break;
  }
  return new TextDecoder("utf-8").decode(tout);
}

/** Reads at most 512 KB of an HTML page. @returns {Promise<{html:string,urlFinale:string}|null>} */
export async function lirePage(url, { signal, delai = 5000, maxOctets = 512 * 1024 } = {}) {
  const s = signalAvecDelai(delai, signal);
  try {
    const r = await fetch(url, { credentials: "omit", redirect: "follow", signal: s.signal });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("text/html")) return null;
    return { html: await lireLimite(r, maxOctets), urlFinale: r.url || url };
  } catch {
    return null;
  } finally {
    s.liberer();
  }
}

/** Reads a small JSON document (web app manifest). */
export async function lireJson(url, { signal, delai = 3000, maxOctets = 100 * 1024 } = {}) {
  const s = signalAvecDelai(delai, signal);
  try {
    const r = await fetch(url, { credentials: "omit", redirect: "follow", signal: s.signal });
    if (!r.ok) return null;
    return JSON.parse(await lireLimite(r, maxOctets));
  } catch {
    return null;
  } finally {
    s.liberer();
  }
}
