import { A } from "../../core/actions.js";
import { avecDomaine, normaliserDomaine, reglesVpnDe, routeDe } from "../../core/domainesVpn.js";
import { ajouter as ajouterOperation } from "../../core/fileOperations.js";
import { decrire } from "../../core/rejeu.js";
import { plateforme } from "../../platform/index.js";
import { el } from "../dom.js";

/**
 * V5.6: the rule of the site of the active tab, in the toolbar window: where it travels now,
 * and "Toujours en direct" / "Toujours par le VPN". The rule is a synced setting (written like
 * any change made from this window) and the tab is reloaded to apply it.
 *
 * @param {{ onglet: {ok: boolean, url?: string}, charger: () => Promise<{store: any, peutEcrire: boolean}>,
 *   stockage: any, vpn: any, chromeApi?: any }} p
 * @returns {Promise<HTMLElement|null>} null when there is nothing to say (VPN off, no valid tab)
 */
export async function blocRegleSite({
  onglet,
  charger,
  stockage,
  vpn,
  chromeApi = globalThis.chrome,
}) {
  const hote = onglet.ok ? normaliserDomaine(onglet.url) : null;
  if (!hote) return null;
  const etat = await vpn.etat().catch(() => null);
  if (!etat?.actif) return null;
  const { store, peutEcrire } = await charger();
  let regles = reglesVpnDe(store.lire().reglages);

  const racine = el("div", { class: "popup-regle" });
  const dessiner = (message = null) => {
    const route = routeDe(regles, hote);
    const choix = (cible, libelle) =>
      el("button", {
        type: "button",
        class: "bouton",
        texte: libelle,
        disabled: !peutEcrire || route === cible,
        onclick: () => appliquer(cible),
      });
    racine.replaceChildren(
      el("p", {
        class: "reglages-note",
        role: "status",
        texte:
          message ??
          (route === "vpn" ? "Ce site passe par le VPN." : "Ce site est en direct (règle)."),
      }),
      el(
        "div",
        { class: "vpn-actions" },
        choix("direct", "Toujours en direct"),
        choix("vpn", "Toujours par le VPN"),
      ),
    );
  };

  async function appliquer(cible) {
    const suivantes = avecDomaine(regles, hote, cible);
    if (routeDe(suivantes, hote) !== cible) {
      // A rule on a parent domain still decides: it is edited in the settings.
      return dessiner("Une règle sur le domaine parent décide : modifiez-la dans Réglages → VPN.");
    }
    const action = { type: A.REGLAGES_MODIFIER, changements: { vpn: suivantes } };
    const operation = {
      idOp: globalThis.crypto.randomUUID(),
      action,
      creeLe: Date.now(),
      ...decrire(store.lire(), action),
    };
    store.envoyer(action);
    try {
      await stockage.sauvegarder(store.lire());
      const synchro = await plateforme.preferences.lire("synchro").catch(() => null);
      if (synchro?.uid) {
        await plateforme.operations.ecrire(globalThis.crypto.randomUUID(), {
          uid: synchro.uid,
          file: ajouterOperation([], operation).file,
        });
      }
      await vpn.definirRegles(reglesVpnDe(store.lire().reglages));
    } catch (e) {
      return dessiner(`Enregistrement impossible : ${e?.message ?? "réessayez"}.`);
    }
    regles = reglesVpnDe(store.lire().reglages);
    dessiner();
    try {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await chromeApi.tabs.reload(tab.id);
    } catch {
      /* the rule applies at the next load */
    }
  }

  dessiner();
  return racine;
}
