/**
 * V4.17: availability of the sites of a user. The browser sends only ids; the URLs are read in
 * the user's own grid. No AI call (so no AI quota): a separate quota of 300 checks per day.
 * A site is never called "dead" on one answer: the browser asks twice (src/core/verification.js).
 *
 * Statuses: ok | redirige (final domain differs) | introuvable (404, 410) | erreur-serveur (5xx)
 * | injoignable (DNS, timeout, refused) | bloque (401, 403, 429: nothing can be concluded) |
 * non-verifiable (private or sensitive address).
 */
import { EntreeInvalide, valider } from "../validation.js";
import { sitesDe } from "../partage/listeCompacte.js";
import { domaine } from "../partage/url.js";

export const VERIFICATIONS_PAR_JOUR = 300;
export const IDS_PAR_APPEL_MAX = 50;

/** Pure: the status of one answer, or of the error that replaced it. */
export function classer({ statut, urlFinale, url, erreur }) {
  if (erreur) {
    if (erreur === "adresse-interdite" || erreur === "confidentialite")
      return { statut: "non-verifiable" };
    return { statut: "injoignable" };
  }
  if (statut === 404 || statut === 410) return { statut: "introuvable", code: statut };
  if (statut >= 500) return { statut: "erreur-serveur", code: statut };
  if (statut === 401 || statut === 403 || statut === 429)
    return { statut: "bloque", code: statut };
  if (statut >= 200 && statut < 400) {
    if (domaine(urlFinale) !== domaine(url)) return { statut: "redirige", urlFinale };
    return { statut: "ok" };
  }
  return { statut: "bloque", code: statut };
}

/**
 * @param {{ db: any, consommer: Function,
 *   sonder: (url: string) => Promise<{ statut: number, urlFinale: string }>,
 *   limite?: number }} deps
 */
export function creerVerificationSites({
  db,
  consommer,
  sonder,
  limite = VERIFICATIONS_PAR_JOUR,
}) {
  return async function verifierSites(uid, donnees) {
    const { ids } = valider(donnees, {
      ids: {
        type: "libre",
        requis: true,
        verifier: (v) => {
          if (
            !Array.isArray(v) ||
            v.length < 1 ||
            v.length > IDS_PAR_APPEL_MAX ||
            !v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 128)
          )
            throw new EntreeInvalide(`ids : 1 à ${IDS_PAR_APPEL_MAX} identifiants attendus.`);
        },
      },
    });
    const snap = await db.doc(`users/${uid}`).get();
    const parId = new Map(sitesDe(snap.exists ? snap.data()?.grille : []).map((s) => [s.id, s]));
    const sites = [...new Set(ids)].map((id) => parId.get(id)).filter(Boolean);
    if (!sites.length) return { resultats: [] };
    await consommer(uid, { n: sites.length, limite, document: "quotaVerifs" });
    const resultats = [];
    // A few at a time: fast enough, and the server is not a scanner.
    for (let i = 0; i < sites.length; i += 5) {
      const lot = await Promise.all(
        sites.slice(i, i + 5).map(async (s) => {
          try {
            const r = await sonder(s.url);
            return { id: s.id, ...classer({ ...r, url: s.url }) };
          } catch (e) {
            return { id: s.id, ...classer({ erreur: e?.code ?? "inaccessible" }) };
          }
        }),
      );
      resultats.push(...lot);
    }
    return { resultats };
  };
}
