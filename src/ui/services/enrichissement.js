import { A } from "../../core/actions.js";
import { iaPrete } from "../../core/ia.js";

/**
 * Tags and description proposed by the AI for a site (V4.4). Never blocks the adding: the
 * site is marked "en_attente", the work runs in the background (2 at a time at most) and the
 * result comes back as SITE_DEFINIR_IA (ignored by the reducer if the user wrote their own
 * tags, or if the site is gone).
 *
 * @param {{
 *   store: { envoyer: (a: object) => void, lire: () => any },
 *   plateforme: { capacites: { lirePagesWeb?: boolean }, lireExtrait?: (url: string) => Promise<any> },
 *   contexte: () => Promise<{ ia: object, modeCompte: boolean, enLigne: boolean, cles: any[] }>,
 *   appeler: (nom: string, donnees: object) => Promise<any>,
 *   codeErreur?: (e: any) => string,
 *   simultanes?: number, horloge?: () => number,
 * }} deps
 */
export function creerEnrichissement({
  store,
  plateforme,
  contexte,
  appeler,
  codeErreur = (e) => e?.details?.code ?? e?.code ?? "inconnue",
  simultanes = 2,
  horloge = () => Date.now(),
}) {
  const attente = [];
  let enCours = 0;

  const definir = (id, champs) => store.envoyer({ type: A.SITE_DEFINIR_IA, id, ...champs });

  async function generer({ id, url, titre }) {
    try {
      const extrait = (await plateforme.lireExtrait?.(url).catch(() => null)) ?? null;
      const r = await appeler("iaGenererTags", {
        ...(extrait ? { extrait } : {}),
        url,
        titre: titre ?? "",
      });
      definir(id, { etat: "ok", tags: r.tags, description: r.description, majLe: horloge() });
    } catch (e) {
      definir(id, { etat: "echec", erreur: codeErreur(e), majLe: horloge() });
    }
  }

  function suite() {
    while (enCours < simultanes && attente.length) {
      const tache = attente.shift();
      enCours++;
      generer(tache).finally(() => {
        enCours--;
        suite();
      });
    }
  }

  return {
    /** Asks for a proposal for one site; false when nothing is started (AI not ready…). */
    async demander(site) {
      if (!plateforme.capacites?.lirePagesWeb) return false;
      const pret = iaPrete(await contexte());
      if (!pret.prete) return false;
      definir(site.id, { etat: "en_attente" });
      attente.push({ id: site.id, url: site.url, titre: site.titre });
      suite();
      return true;
    },
    /** For the tests. */
    enAttente: () => attente.length + enCours,
  };
}

let service = null;

/** Installed once by the app; until then (and in tests) enrichir does nothing. */
export const installerEnrichissement = (s) => {
  service = s;
};

/** Asks for a proposal for a site; never throws. */
export const enrichir = (site) => {
  service?.demander(site).catch(() => {});
};
